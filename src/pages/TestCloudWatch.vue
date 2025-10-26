<template>
  <div class="test-cloudwatch">
    <v-container>
      <v-row justify="center">
        <v-col cols="12" md="8">
          <v-card>
            <v-card-title>CloudWatch Integration Test</v-card-title>
            <v-card-text>
              <p>This page tests the CloudWatch logging integration. Click the buttons below to trigger different types of errors.</p>
              
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

              <v-btn 
                color="success" 
                class="ma-2" 
                @click="testDatabaseConnection"
                :loading="loading.dbConnection"
              >
                Test Database Connection
              </v-btn>

              <v-btn 
                color="info" 
                class="ma-2" 
                @click="checkCloudWatchStatus"
                :loading="loading.cwStatus"
              >
                Check CloudWatch Status
              </v-btn>
              
              <div v-if="lastResult" class="mt-4">
                <v-alert 
                  :type="lastResult.success ? 'success' : 'error'"
                  :text="lastResult.message"
                ></v-alert>
              </div>

              <div v-if="statusInfo" class="mt-4">
                <v-card>
                  <v-card-title>System Status</v-card-title>
                  <v-card-text>
                    <pre>{{ statusInfo }}</pre>
                  </v-card-text>
                </v-card>
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

export default {
  name: 'TestCloudWatch',
  
  data() {
    return {
      loading: {
        payment: false,
        database: false,
        api: false,
        firebase: false,
        general: false,
        dbConnection: false,
        cwStatus: false
      },
      lastResult: null,
      statusInfo: null
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
        
        await cloudWatchLogger.paymentError(
          new Error('Payment processing failed - insufficient funds'),
          'txn_123456789'
        );
        this.lastResult = {
          success: true,
          message: 'Payment error logged to CloudWatch successfully!'
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Failed to log payment error: ${error.message}`
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
        
        await cloudWatchLogger.databaseError(
          new Error('Database connection timeout'),
          'user_query'
        );
        this.lastResult = {
          success: true,
          message: 'Database error logged to CloudWatch successfully!'
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Failed to log database error: ${error.message}`
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
        
        await cloudWatchLogger.apiError(
          new Error('External API returned 500 error'),
          '/api/external-service'
        );
        this.lastResult = {
          success: true,
          message: 'API error logged to CloudWatch successfully!'
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Failed to log API error: ${error.message}`
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
    },

    async testDatabaseConnection() {
      this.loading.dbConnection = true;
      try {
        // Log button click
        await cloudWatchLogger.logButtonClick('Test Database Connection', {
          component: 'TestCloudWatch',
          testType: 'database_connection'
        });

        // Import and test database connection
        const { checkDatabaseConnection, getDatabaseConnectionStatus } = await import('@/firebase');
        const result = await checkDatabaseConnection();
        const status = getDatabaseConnectionStatus();

        if (result.connected) {
          this.lastResult = {
            success: true,
            message: 'Database connection test successful!'
          };
          this.statusInfo = JSON.stringify({
            connectionTest: result,
            connectionStatus: status,
            timestamp: new Date().toISOString()
          }, null, 2);
        } else {
          this.lastResult = {
            success: false,
            message: `Database connection failed: ${result.error?.message}`
          };
          this.statusInfo = JSON.stringify({
            connectionTest: result,
            connectionStatus: status,
            error: result.error,
            timestamp: new Date().toISOString()
          }, null, 2);
        }
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Database connection test failed: ${error.message}`
        };
        this.statusInfo = JSON.stringify({
          error: error.message,
          timestamp: new Date().toISOString()
        }, null, 2);
      } finally {
        this.loading.dbConnection = false;
      }
    },

    async checkCloudWatchStatus() {
      this.loading.cwStatus = true;
      try {
        // Log button click
        await cloudWatchLogger.logButtonClick('Check CloudWatch Status', {
          component: 'TestCloudWatch',
          testType: 'cloudwatch_status'
        });

        const status = cloudWatchLogger.getStatus();
        const connectionTest = await cloudWatchLogger.testConnection();

        this.lastResult = {
          success: status.enabled && connectionTest.success,
          message: status.enabled 
            ? (connectionTest.success ? 'CloudWatch is working properly!' : `CloudWatch error: ${connectionTest.error}`)
            : 'CloudWatch is not configured'
        };

        this.statusInfo = JSON.stringify({
          cloudWatchStatus: status,
          connectionTest: connectionTest,
          timestamp: new Date().toISOString()
        }, null, 2);
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `CloudWatch status check failed: ${error.message}`
        };
        this.statusInfo = JSON.stringify({
          error: error.message,
          timestamp: new Date().toISOString()
        }, null, 2);
      } finally {
        this.loading.cwStatus = false;
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
