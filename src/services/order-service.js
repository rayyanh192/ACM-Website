const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Load timeout configuration
const timeoutConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../../config/timeout.json'), 'utf8'));

class OrderService {
    constructor() {
        // FIXED: Improved database connection pool with better settings
        this.pool = new Pool({
            host: process.env.DB_HOST || 'checkout-db-prod.cluster-xyz.us-east-1.rds.amazonaws.com',
            port: process.env.DB_PORT || 5432,
            database: process.env.DB_NAME || 'checkout',
            user: process.env.DB_USER || 'checkout_user',
            password: process.env.DB_PASSWORD,
            
            // FIXED: Increased pool size and timeouts to handle load better
            max: timeoutConfig.database.pool.max_connections, // 50 connections (was 20)
            min: timeoutConfig.database.pool.min_connections, // 10 connections (was 5)
            idleTimeoutMillis: timeoutConfig.database.pool.idle_timeout_ms, // 5 minutes
            connectionTimeoutMillis: timeoutConfig.database.pool.acquire_timeout_ms, // 15 seconds (was 5)
            query_timeout: timeoutConfig.database.query_timeout_ms, // 15 seconds (was 10)
            
            // ADDED: Connection validation and leak detection
            allowExitOnIdle: false,
            keepAlive: true,
            keepAliveInitialDelayMillis: 10000,
            
            // Connection validation
            application_name: 'checkout-order-service',
            statement_timeout: timeoutConfig.database.query_timeout_ms,
        });

        this.pool.on('error', (err) => {
            console.error('Database pool error:', err);
            // Add metrics/alerting here
        });

        this.pool.on('connect', (client) => {
            console.log('New database connection established');
        });

        this.pool.on('acquire', (client) => {
            console.log('Connection acquired from pool');
        });

        this.pool.on('release', (client) => {
            console.log('Connection released back to pool');
        });

        // Track pool metrics
        this.poolMetrics = {
            totalConnections: 0,
            idleConnections: 0,
            waitingClients: 0
        };

        // Monitor pool health every 30 seconds
        setInterval(() => {
            this.logPoolHealth();
        }, 30000);
    }

    logPoolHealth() {
        const totalCount = this.pool.totalCount;
        const idleCount = this.pool.idleCount;
        const waitingCount = this.pool.waitingCount;
        
        console.log(`Pool Health - Total: ${totalCount}, Idle: ${idleCount}, Waiting: ${waitingCount}`);
        
        // Alert if pool utilization is high
        const utilization = ((totalCount - idleCount) / timeoutConfig.database.pool.max_connections) * 100;
        if (utilization > 80) {
            console.warn(`High database pool utilization: ${utilization.toFixed(1)}%`);
        }
        
        if (waitingCount > 5) {
            console.warn(`High number of waiting clients: ${waitingCount}`);
        }
    }

    async createOrder(orderData) {
        const startTime = Date.now();
        let client;
        
        try {
            // IMPROVED: Better connection acquisition with timeout handling
            console.log('Acquiring database connection for order creation');
            client = await this.pool.connect();
            console.log(`Connection acquired in ${Date.now() - startTime}ms`);
            
            await client.query('BEGIN');

            // Insert order
            const orderQuery = `
                INSERT INTO orders (customer_id, total_amount, currency, status, created_at)
                VALUES ($1, $2, $3, $4, NOW())
                RETURNING id, created_at
            `;
            const orderResult = await client.query(orderQuery, [
                orderData.customer_id,
                orderData.total_amount,
                orderData.currency,
                'pending'
            ]);

            const orderId = orderResult.rows[0].id;

            // Insert order items with better error handling
            for (const item of orderData.items) {
                const itemQuery = `
                    INSERT INTO order_items (order_id, product_id, quantity, unit_price)
                    VALUES ($1, $2, $3, $4)
                `;
                // This is line 78 mentioned in the error logs - now with better timeout handling
                await client.query(itemQuery, [
                    orderId,
                    item.product_id,
                    item.quantity,
                    item.unit_price
                ]);
            }

            await client.query('COMMIT');
            
            console.log(`Order ${orderId} created successfully in ${Date.now() - startTime}ms`);
            
            return {
                id: orderId,
                status: 'created',
                created_at: orderResult.rows[0].created_at
            };

        } catch (error) {
            if (client) {
                try {
                    await client.query('ROLLBACK');
                } catch (rollbackError) {
                    console.error('Rollback failed:', rollbackError);
                }
            }
            
            console.error('Order creation failed:', error);
            
            // IMPROVED: Better error classification and handling
            if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
                console.error(`Database timeout after ${Date.now() - startTime}ms`);
                throw new Error('Database connection timeout - please retry');
            } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
                console.error('Database connection refused');
                throw new Error('Database temporarily unavailable');
            } else if (error.message.includes('pool error') || error.message.includes('Timeout waiting for idle object')) {
                console.error('Connection pool exhausted');
                throw new Error('Service temporarily overloaded - please retry');
            } else if (error.code && error.code.startsWith('23')) { // PostgreSQL constraint violations
                console.error('Database constraint violation:', error.detail);
                throw new Error('Invalid order data: ' + error.detail);
            }
            
            throw error;
        } finally {
            if (client) {
                try {
                    client.release();
                    console.log(`Connection released after ${Date.now() - startTime}ms`);
                } catch (releaseError) {
                    console.error('Error releasing connection:', releaseError);
                }
            }
        }
    }

    async getOrder(orderId) {
        const startTime = Date.now();
        
        try {
            const query = `
                SELECT o.*, 
                       json_agg(
                           json_build_object(
                               'product_id', oi.product_id,
                               'quantity', oi.quantity,
                               'unit_price', oi.unit_price
                           )
                       ) as items
                FROM orders o
                LEFT JOIN order_items oi ON o.id = oi.order_id
                WHERE o.id = $1
                GROUP BY o.id
            `;
            
            const result = await this.pool.query(query, [orderId]);
            
            if (result.rows.length === 0) {
                throw new Error('Order not found');
            }
            
            console.log(`Order ${orderId} retrieved in ${Date.now() - startTime}ms`);
            return result.rows[0];
            
        } catch (error) {
            console.error('Failed to get order:', error);
            
            // Better error handling for read operations
            if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
                throw new Error('Database query timeout - please retry');
            }
            
            throw error;
        }
    }

    async updateOrderStatus(orderId, status) {
        const startTime = Date.now();
        
        try {
            const query = `
                UPDATE orders 
                SET status = $1, updated_at = NOW()
                WHERE id = $2
                RETURNING *
            `;
            
            const result = await this.pool.query(query, [status, orderId]);
            
            if (result.rows.length === 0) {
                throw new Error('Order not found');
            }
            
            console.log(`Order ${orderId} status updated to ${status} in ${Date.now() - startTime}ms`);
            return result.rows[0];
            
        } catch (error) {
            console.error('Failed to update order status:', error);
            
            if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
                throw new Error('Database update timeout - please retry');
            }
            
            throw error;
        }
    }

    async healthCheck() {
        try {
            const result = await this.pool.query('SELECT 1 as health_check');
            const poolStats = {
                totalConnections: this.pool.totalCount,
                idleConnections: this.pool.idleCount,
                waitingClients: this.pool.waitingCount,
                maxConnections: timeoutConfig.database.pool.max_connections
            };
            
            return {
                status: 'healthy',
                database: 'connected',
                pool: poolStats
            };
        } catch (error) {
            console.error('Health check failed:', error);
            return {
                status: 'unhealthy',
                error: error.message,
                pool: {
                    totalConnections: this.pool.totalCount,
                    idleConnections: this.pool.idleCount,
                    waitingClients: this.pool.waitingCount
                }
            };
        }
    }

    async close() {
        console.log('Closing database connection pool');
        await this.pool.end();
    }
}

module.exports = OrderService;