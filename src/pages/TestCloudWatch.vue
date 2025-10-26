<template>
  <div class="test-cloudwatch">
    <v-container>
      <!-- System Health Monitor -->
      <SystemHealthMonitor />
      
      <v-row justify="center">
        <v-col cols="12" md="8">
          <v-card>
            <v-card-title>CloudWatch Integration Test</v-card-title>
            <v-card-text>
              <p>This page tests the CloudWatch logging integration and monitors system health. Click the buttons below to trigger different types of errors and test the enhanced error handling.</p>
              
              <v-btn 
                color="error" 
                class="ma-2" 
                @click="testPaymentError"
                :loading="loading.payment"
              >
                Test Payment Error
              </v-btn>
              
              <v-btn 
                color="warning" 
                class="ma-2" 
                @click="testDatabaseError"
                :loading="loading.database"
              >
                Test Database Error
              </v-btn>
              
              <v-btn 
                color="info" 
                class="ma-2" 
                @click="testApiError"
                :loading="loading.api"
              >
                Test API Error
              </v-btn>
              
              <v-btn 
                color="secondary" 
                class="ma-2" 
                @click="testFirebaseError"
                :loading="loading.firebase"
              >
                Test Firebase Error
              </v-btn>
              
              <v-btn 
                color="primary" 
                class="ma-2" 
                @click="testGeneralError"
                :loading="loading.general"
              >
                Test General Error
              </v-btn>
              
              <div v-if="lastResult" class="mt-4">
                <v-alert 
                  :type="lastResult.success ? 'success' : 'error'"
                  :text="lastResult.message"
                ></v-alert>
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<script>
import { cloudWatchLogger } from '@/utils/cloudWatchLogger';
import { paymentHandler } from '@/utils/paymentHandler';
import { databaseConfig } from '@/config/databaseConfig';
import { connectionPool } from '@/utils/connectionPool';
import SystemHealthMonitor from '@/components/SystemHealthMonitor.vue';

export default {
  name: 'TestCloudWatch',
  
  components: {
    SystemHealthMonitor
  },
  
  data() {
    return {
      loading: {
        payment: false,
        database: false,
        api: false,
        firebase: false,
        general: false
      },
      lastResult: null
    };
  },
  
  methods: {
    async testPaymentError() {
      this.loading.payment = true;
      try {
        // Log button click
        await cloudWatchLogger.logButtonClick('Test Payment Error', {
          component: 'TestCloudWatch',
          testType: 'payment_error'
        });
        
        // Test the new payment handler with realistic payment data
        const paymentData = {
          amount: 99.99,
          currency: 'USD',
          transactionId: `test_${Date.now()}`,
          paymentMethod: 'credit_card'
        };

        try {
          const result = await paymentHandler.processPayment(paymentData);
          this.lastResult = {
            success: true,
            message: `Payment processed successfully! Transaction ID: ${result.transactionId}`
          };
        } catch (paymentError) {
          // This will trigger the enhanced error logging
          await cloudWatchLogger.paymentError(paymentError, paymentData.transactionId);
          this.lastResult = {
            success: false,
            message: `Payment failed: ${paymentError.message}`
          };
        }
        
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Failed to test payment: ${error.message}`
        };
      } finally {
        this.loading.payment = false;
      }
    },
    
    async testDatabaseError() {
      this.loading.database = true;
      try {
        // Log button click
        await cloudWatchLogger.logButtonClick('Test Database Error', {
          component: 'TestCloudWatch',
          testType: 'database_error'
        });
        
        // Test database connection with the new database config
        try {
          const connection = await databaseConfig.getConnection('test_query');
          
          // Simulate a database operation that might fail
          await databaseConfig.executeQuery(async (db) => {
            // Simulate connection pool exhaustion by creating multiple concurrent queries
            const promises = [];
            for (let i = 0; i < 25; i++) { // Exceed max connections
              promises.push(databaseConfig.executeQuery(async () => {
                await new Promise(resolve => setTimeout(resolve, 100));
                return { result: `query_${i}` };
              }, `concurrent_query_${i}`));
            }
            
            await Promise.all(promises);
            return { status: 'completed' };
          }, 'test_database_operation');
          
          connection.release();
          
          this.lastResult = {
            success: true,
            message: 'Database operations completed successfully!'
          };
        } catch (dbError) {
          // This will trigger the enhanced database error logging
          await cloudWatchLogger.databaseError(dbError, 'test_operation');
          this.lastResult = {
            success: false,
            message: `Database error: ${dbError.message}`
          };
        }
        
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Failed to test database: ${error.message}`
        };
      } finally {
        this.loading.database = false;
      }
    },
    
    async testApiError() {
      this.loading.api = true;
      try {
        // Log button click
        await cloudWatchLogger.logButtonClick('Test API Error', {
          component: 'TestCloudWatch',
          testType: 'api_error'
        });
        
        // Test connection pool with multiple concurrent requests
        try {
          const requests = [];
          for (let i = 0; i < 15; i++) {
            requests.push(
              connectionPool.makeRequest(`https://httpbin.org/delay/${Math.random() * 2}`, {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json'
                }
              })
            );
          }
          
          const results = await Promise.allSettled(requests);
          const successful = results.filter(r => r.status === 'fulfilled').length;
          const failed = results.filter(r => r.status === 'rejected').length;
          
          this.lastResult = {
            success: true,
            message: `API test completed: ${successful} successful, ${failed} failed requests`
          };
        } catch (apiError) {
          await cloudWatchLogger.apiError(apiError, '/test-endpoint');
          this.lastResult = {
            success: false,
            message: `API error: ${apiError.message}`
          };
        }
        
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Failed to test API: ${error.message}`
        };
      } finally {
        this.loading.api = false;
      }
    },
    
    async testFirebaseError() {
      this.loading.firebase = true;
      try {
        // Log button click
        await cloudWatchLogger.logButtonClick('Test Firebase Error', {
          component: 'TestCloudWatch',
          testType: 'firebase_error'
        });
        
        await cloudWatchLogger.firebaseError(
          new Error('Firebase authentication failed'),
          'signIn'
        );
        this.lastResult = {
          success: true,
          message: 'Firebase error logged to CloudWatch successfully!'
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Failed to log Firebase error: ${error.message}`
        };
      } finally {
        this.loading.firebase = false;
      }
    },
    
    async testGeneralError() {
      this.loading.general = true;
      try {
        // Log button click
        await cloudWatchLogger.logButtonClick('Test General Error', {
          component: 'TestCloudWatch',
          testType: 'general_error'
        });
        
        await cloudWatchLogger.error(
          'General system error - website crash simulation',
          { 
            component: 'TestCloudWatch',
            action: 'testGeneralError',
            timestamp: new Date().toISOString()
          }
        );
        this.lastResult = {
          success: true,
          message: 'General error logged to CloudWatch successfully!'
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Failed to log general error: ${error.message}`
        };
      } finally {
        this.loading.general = false;
      }
    }
  }
};
</script>

<style scoped>
.test-cloudwatch {
  padding: 20px 0;
}
</style>
