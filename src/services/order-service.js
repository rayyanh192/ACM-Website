const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

class OrderService {
    constructor() {
        this.config = this.loadConfig();
        this.pool = this.createConnectionPool();
        this.setupPoolEventHandlers();
    }

    loadConfig() {
        try {
            const configPath = path.join(__dirname, '../../config/timeout.json');
            const configData = fs.readFileSync(configPath, 'utf8');
            return JSON.parse(configData);
        } catch (error) {
            console.warn('Config file not found, using defaults:', error.message);
            return {
                database: {
                    connection_timeout_ms: 30000,
                    pool_timeout_ms: 60000,
                    max_connections: 20,
                    min_connections: 5
                }
            };
        }
    }

    createConnectionPool() {
        const dbConfig = this.config.database;
        
        const poolConfig = {
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5432,
            database: process.env.DB_NAME || 'checkout_db',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'password',
            
            // Connection pool settings
            max: dbConfig.max_connections || 20,
            min: dbConfig.min_connections || 5,
            
            // Timeout settings
            connectionTimeoutMillis: dbConfig.connection_timeout_ms || 30000,
            idleTimeoutMillis: dbConfig.pool_timeout_ms || 60000,
            
            // Additional settings for stability
            acquireTimeoutMillis: 60000,
            createTimeoutMillis: 30000,
            destroyTimeoutMillis: 5000,
            reapIntervalMillis: 1000,
            createRetryIntervalMillis: 200,
            
            // Enable keep-alive
            keepAlive: true,
            keepAliveInitialDelayMillis: 10000
        };

        console.log('Creating database connection pool with config:', {
            host: poolConfig.host,
            port: poolConfig.port,
            database: poolConfig.database,
            max: poolConfig.max,
            min: poolConfig.min,
            connectionTimeoutMillis: poolConfig.connectionTimeoutMillis
        });

        return new Pool(poolConfig);
    }

    setupPoolEventHandlers() {
        this.pool.on('connect', (client) => {
            console.log('New database client connected');
        });

        this.pool.on('acquire', (client) => {
            console.log('Database client acquired from pool');
        });

        this.pool.on('error', (err, client) => {
            console.error('Database pool error:', err);
        });

        this.pool.on('remove', (client) => {
            console.log('Database client removed from pool');
        });
    }

    async createOrder(orderData) {
        const client = await this.getConnection();
        
        try {
            await client.query('BEGIN');
            
            // Insert order
            const orderQuery = `
                INSERT INTO orders (customer_id, total_amount, status, created_at)
                VALUES ($1, $2, $3, NOW())
                RETURNING id, created_at
            `;
            
            const orderResult = await client.query(orderQuery, [
                orderData.customer_id,
                orderData.total_amount,
                'pending'
            ]);
            
            const orderId = orderResult.rows[0].id;
            
            // Insert order items
            if (orderData.items && orderData.items.length > 0) {
                const itemsQuery = `
                    INSERT INTO order_items (order_id, product_id, quantity, price)
                    VALUES ($1, $2, $3, $4)
                `;
                
                for (const item of orderData.items) {
                    await client.query(itemsQuery, [
                        orderId,
                        item.product_id,
                        item.quantity,
                        item.price
                    ]);
                }
            }
            
            await client.query('COMMIT');
            
            console.log(`Order created successfully: ${orderId}`);
            
            return {
                success: true,
                order_id: orderId,
                created_at: orderResult.rows[0].created_at
            };
            
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error creating order:', error);
            
            if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
                throw new Error('Database connection timeout');
            }
            
            throw error;
        } finally {
            client.release();
        }
    }

    async getConnection() {
        try {
            console.log('Acquiring database connection from pool...');
            const client = await this.pool.connect();
            console.log('Database connection acquired successfully');
            return client;
        } catch (error) {
            console.error('Failed to acquire database connection:', error);
            
            if (error.message.includes('timeout') || error.code === 'ETIMEDOUT') {
                throw new Error('Database connection timeout - pool may be exhausted');
            }
            
            if (error.message.includes('Connection terminated') || 
                error.message.includes('connect ETIMEDOUT')) {
                throw new Error('Database connection failed - server unreachable');
            }
            
            throw error;
        }
    }

    async getOrderById(orderId) {
        const client = await this.getConnection();
        
        try {
            const query = `
                SELECT o.*, 
                       json_agg(
                           json_build_object(
                               'product_id', oi.product_id,
                               'quantity', oi.quantity,
                               'price', oi.price
                           )
                       ) as items
                FROM orders o
                LEFT JOIN order_items oi ON o.id = oi.order_id
                WHERE o.id = $1
                GROUP BY o.id
            `;
            
            const result = await client.query(query, [orderId]);
            
            if (result.rows.length === 0) {
                return null;
            }
            
            return result.rows[0];
            
        } catch (error) {
            console.error('Error fetching order:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    async updateOrderStatus(orderId, status) {
        const client = await this.getConnection();
        
        try {
            const query = `
                UPDATE orders 
                SET status = $1, updated_at = NOW()
                WHERE id = $2
                RETURNING *
            `;
            
            const result = await client.query(query, [status, orderId]);
            
            if (result.rows.length === 0) {
                throw new Error(`Order not found: ${orderId}`);
            }
            
            console.log(`Order ${orderId} status updated to: ${status}`);
            return result.rows[0];
            
        } catch (error) {
            console.error('Error updating order status:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    async getPoolStats() {
        return {
            total_connections: this.pool.totalCount,
            idle_connections: this.pool.idleCount,
            waiting_requests: this.pool.waitingCount,
            max_connections: this.pool.options.max,
            min_connections: this.pool.options.min
        };
    }

    async healthCheck() {
        try {
            const client = await this.pool.connect();
            const result = await client.query('SELECT NOW() as current_time');
            client.release();
            
            const stats = await this.getPoolStats();
            
            return {
                status: 'healthy',
                database_time: result.rows[0].current_time,
                pool_stats: stats
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                pool_stats: await this.getPoolStats()
            };
        }
    }

    async close() {
        console.log('Closing database connection pool...');
        await this.pool.end();
        console.log('Database connection pool closed');
    }
}

module.exports = OrderService;