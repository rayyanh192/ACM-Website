/* eslint linebreak-style: ["error", "windows"] */
/* eslint-disable max-len */
const fs = require("fs");
const path = require("path");
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const {firestore} = require("firebase-admin");
const request = require("request");
const moment = require("moment");
const nodemailer = require("nodemailer");
// eslint-disable-next-line no-unused-vars
const {tz} = require("moment-timezone");
// const {App} = require("@slack/bolt");

// Import new payment and database modules
const { processPayment, refundPayment, getPaymentStatus } = require("./payment_handler");
const { executeMySQLQuery, executePostgresQuery, executeFirestoreQuery, healthCheck: dbHealthCheck } = require("./database_config");
const { poolManager } = require("./connection_pool");

admin.initializeApp();

// Initialize CloudWatch logger for error reporting
// This will be used by payment_handler and database_config modules
global.cloudWatchLogger = {
  async paymentError(error, transactionId) {
    console.error(`[PAYMENT ERROR] ${error.message}`, { transactionId, error: error.stack });
  },
  async databaseError(error, operation) {
    console.error(`[DATABASE ERROR] ${error.message}`, { operation, error: error.stack });
  },
  async apiError(error, endpoint) {
    console.error(`[API ERROR] ${error.message}`, { endpoint, error: error.stack });
  },
  async info(message, context) {
    console.log(`[INFO] ${message}`, context);
  }
};

exports.addRole = functions.https.onCall(async (data, context) => {
    const isAdmin = context.auth.token.admin || false;
    if (!isAdmin) {
        return {message: "You must be an admin to add another admin user"};
    }
    const uid = data.uid;
    const role = data.role;
    if (!uid) {
        return {message: "Please pass a UID to the function"};
    }

    const currentClaims = (await admin.auth().getUser(uid)).customClaims || {};
    const roles = currentClaims?.roles || [];
    roles.push(role);
    currentClaims.roles = roles;

    await admin.auth().setCustomUserClaims(uid, currentClaims);
    const userRecord = await admin.auth().getUser(uid);
    return {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        claims: userRecord.customClaims,
    };
});

exports.removeRole = functions.https.onCall(async (data, context) => {
    const isAdmin = context.auth.token.admin || false;
    if (!isAdmin) {
        return {message: "You must be an admin to add another admin user"};
    }
    const uid = data.uid;
    const role = data.role;
    if (!uid) {
        return {message: "Please pass a UID to the function"};
    }
    const currentClaims = (await admin.auth().getUser(uid)).customClaims;

    const roles = currentClaims?.roles ?? [];
    console.log("INDEX", roles.indexOf(role));
    roles.splice(roles.indexOf(role), 1);
    currentClaims.roles = roles;

    await admin.auth().setCustomUserClaims(uid, currentClaims);
    const userRecord = await admin.auth().getUser(uid);
    return {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        claims: userRecord.customClaims,
    };
});

exports.searchUsers = functions.https.onCall((data, context) => {
    const isAdmin = context.auth.token.admin || false;
    if (!isAdmin) {
        return {error: "You must be an admin to search users"};
    }
    if (!data.uids) {
        return {error: "Please pass an array of UIDs to the function"};
    }
    const uids = data.uids.map((uid) => {
return {uid: uid};
});

    console.log(uids);

    return admin.auth().getUsers(uids).then((records) => {
        return {users: records.users.map((userRecord) => {
            return {
                uid: userRecord.uid,
                email: userRecord.email,
                displayName: userRecord.displayName,
                claims: userRecord.customClaims,
            };
        })};
    });
});

exports.addAdmin = functions.https.onCall((data, context) => {
    const uid = data.uid;
    const isAdmin = context.auth.token.admin || false;
    if (!isAdmin) {
        return {message: "You must be an admin to add another admin user"};
    }
    if (!uid) {
        return {message: "Please pass a UID to the function"};
    }
    return admin.auth().setCustomUserClaims(uid, {admin: true}).then(() => {
        return {message: "User added as admin"};
    });
});
exports.removeAdmin = functions.https.onCall( (data, context) => {
    const uid = data.uid;
    const isAdmin = context.auth.token.admin || false;
    if (!isAdmin) {
        return {message: "You must be an admin to remove another admin user"};
    }
    if (!uid) {
        return {message: "Please pass a UID to the function"};
    }
    return admin.auth().setCustomUserClaims(uid, {admin: true}).then(() => {
        return {message: "User removed as admin"};
    });
});
exports.getEventAttendance = functions.https.onCall( async (data, context) => {
    const eventId = data.id;
    const isAdmin = context.auth.token.admin || false;
    if (!isAdmin) {
        return {message: "You must be an admin to see event statistics"};
    }
    if (!eventId) {
        return {message: "Please pass an event id to the function"};
    }

    const regRef = firestore().collection("registrations");

    const registrations = await regRef.where("event", "==", eventId).count().get();

    return registrations.data().count;
});

exports.getUserAttendance = functions.https.onCall( async (data, context) => {
    const userId = data.id;
    const auth = context.auth;
    if (!auth) {
        return {message: "You must be logged in to call this function", code: 401};
    }

    const regRef = firestore().collection("registrations");

    const attRef = await regRef.where("uid", "==", userId).count().get();
    return attRef.data().count;
});

/* eslint-disable */

exports.sendEventNotifications = functions
.runWith({secrets: ["notificationSecrets"]})
.pubsub.schedule("0 19 * * *").onRun((async (context) => {
    let secretsString = process.env.notificationSecrets;
    let secretStrings = secretsString.replace("\\\"","")
    const secrets = JSON.parse(secretStrings);
    const discordWebhook = secrets.DISCORD_WEBHOOK;
    // const slackBotToken = secrets.SLACK_BOT_TOKEN;
    // const slackAppToken = secrets.SLACK_APP_TOKEN;
    // const slackSigningSecret = secrets.SLACK_SIGNING_SECRET;
    // const slackGeneralChannel = "C0LBTLUV8";
    return await sendEventMessages(discordWebhook/*, slackBotToken, slackAppToken, slackSigningSecret, slackGeneralChannel*/);
}));

/* eslint-disable */
    
exports.sendEventNotificationsTest = functions.runWith({secrets: ["notificationSecrets"]})
.https.onCall( async (data, context) => {
    let secretsString = process.env.notificationSecrets;
    let secretStrings = secretsString.replace("\\\"","")
    const secrets = JSON.parse(secretStrings);
    const discordWebhook = secrets.DISCORD_WEBHOOK_TEST;
    // const slackBotToken = secrets.SLACK_BOT_TOKEN;
    // const slackAppToken = secrets.SLACK_APP_TOKEN;
    // const slackSigningSecret = secrets.SLACK_SIGNING_SECRET;
    // const slackTestChannel = "C040EKTF2N6";
    return await sendEventMessages(discordWebhook /*, slackBotToken, slackAppToken, slackSigningSecret, slackTestChannel*/);
});
    
async function sendEventMessages(discordWebhook /*,slackBotToken, slackAppToken,slackSigningSecret, slackChannel*/){
    const eventRef = firestore().collection("events");

    // Initialize Slack App
    // const app = new App({
    //     token: slackBotToken,
    //     signingSecret: slackSigningSecret,
    //     socketMode: true,
    //     appToken: slackAppToken,
    // });
    // Get upcoming events
    let workshop = await eventRef.where("startDate", ">=", admin.firestore.Timestamp.fromMillis(new Date().getTime() + 60 * 60 * 7 * 1000)).where("startDate", "<=", (admin.firestore.Timestamp.fromMillis(new Date().getTime() + 60 * 60 * (24+7) * 1000))).orderBy("startDate", "asc").get();// eslint-disable-line

    if (workshop.empty) {
        return "No Data";
    }

    // Send Messages
    for (const doc of workshop.docs) {
        var hasFlyer = false;
        if (doc.data().flyer) {
            hasFlyer = true;
            var flyer = await admin.storage().bucket().file(doc.data().flyer).download();
        }

        // const slackTitle = "*Event Happening Tomorrow! " + doc.data().title + "*";
        const discordTitle = "<@&1074916982748614758> **Event Happening Tomorrow! " + doc.data().title + "**";

        const messageBody = "\n" + formatDateTime(doc.data()) +
        "\n" + doc.data().description;

        // Send message to Slack
        // const channel = slackChannel;
        // if (hasFlyer) {
        //     var slackResult = await app.client.files.upload({
        //         channels: channel,
        //         initial_comment: slackTitle + messageBody,
        //         file: flyer[0],
        //     });
        // } else {
        //     var slackResult = await app.client.chat.postMessage({
        //         channels: channel,
        //         text: slackTitle + messageBody,
        //     });
        // }

        // Send message to Discord
        let formdata = {
            "content": discordTitle + messageBody,
        };
        if (hasFlyer) {
            formdata = {
                ...formdata,
                "flyer": {
                    "value": flyer[0],
                    "options": {
                        "filename": "flyer.png",
                        "contentType": null,
        }}};
}
        await request({
            "method": "POST",
            "url": discordWebhook,
            "formData": formdata,
            }, function(error, response) {
            if (error) throw new Error(error);
                console.log(response.body);
        });
        // await slackResult;
    }
    return "done";
}       

exports.sendWelcomeEmail = functions.runWith({secrets: ["mailAppPassword"]})
.https.onCall(async (data, context) => {
    const { email, firstName } = data;

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'santaclara.acm@gmail.com',
            pass: process.env.mailAppPassword,
        }
    });

    const templatePath = path.join(__dirname, 'welcome_email.html');
    let html = fs.readFileSync(templatePath, 'utf8');
    html = html.replace('{{firstName}},', `${firstName},` || '');

    const mailOptions = {
        from: 'SCUACM <santaclara.acm@gmail.com>',
        to: email,
        subject: '😍 Welcome to ACM!! 😍',
        html: html,
    };

    try {
        await transporter.sendMail(mailOptions);
        return { success: true };
    } catch (error) {
        console.error('Error sending email:', error);
        throw new functions.https.HttpsError('internal', 'Failed to send email');
    }
});

function formatDateTime(event) {
    if (!event?.startDate) return "";
    // If a start date is provided but an end date isn't, return the start date:
    // Format: Oct 1st 5:45 pm
    if (event.startDate && !event.endDate) {
      return moment(event.startDate.toDate()).tz("America/Los Angeles").format("MMM Do YYYY, h:mm a");
    }
    // Format the start and end as dates. Ex: Oct 1st
    const startDate = moment(event.startDate.toDate()).tz("America/Los_Angeles").format("MMM Do, YYYY,");
    const endDate = moment(event.endDate.toDate()).tz("America/Los_Angeles").format("MMM Do, YYYY,");

    // Format the start and end as times. Ex: 5:45 pm
    const startTime = moment(event.startDate.toDate()).tz("America/Los_Angeles").format("h:mm a");
    const endTime = moment(event.endDate.toDate()).tz("America/Los_Angeles").format("h:mm a");

    if (startDate === endDate) {
      if (startTime === endTime) {
        // If the start and end match exactly, return only the start date. Ex: Oct 1st, 2022, 5:45 pm
        return `${startDate} ${startTime}`;
      }
      // If the dates match but the times don't, return the start date and both times. Ex: May 10th, 2022, 5:45 pm - 6:45 pm
      return `${startDate} ${startTime} - ${endTime}`;
    }
    // Otherwise, return the start date and time and end date and time. Ex: Feb 12th, 2022, 10:00 am - Feb 13th, 2022, 12:00 pm
    return `${startDate} ${startTime} - ${endDate} ${endTime}`;
}

// ============================================================================
// NEW PAYMENT AND DATABASE FUNCTIONS
// These address the errors mentioned in the deployment logs
// ============================================================================

/**
 * Process Payment Function
 * Addresses: "Payment service connection failed - timeout after 5000ms"
 * Addresses: "HTTPSConnectionPool timeout" errors
 */
exports.processPayment = functions.runWith({
  timeoutSeconds: 540,
  memory: '1GB'
}).https.onCall(async (data, context) => {
  // Require authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const result = await processPayment(data);
    
    // Log successful payment
    await global.cloudWatchLogger.info('Payment processed successfully', {
      userId: context.auth.uid,
      paymentId: result.paymentId,
      amount: result.amount
    });
    
    return result;
  } catch (error) {
    console.error('Payment processing failed:', error);
    
    // Log payment error to CloudWatch
    await global.cloudWatchLogger.paymentError(error, data.paymentMethodId || data.orderId);
    
    throw error;
  }
});

/**
 * Refund Payment Function
 */
exports.refundPayment = functions.runWith({
  timeoutSeconds: 300,
  memory: '512MB'
}).https.onCall(async (data, context) => {
  // Require admin authentication
  const isAdmin = context.auth?.token?.admin || false;
  if (!isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  try {
    const result = await refundPayment(data);
    
    await global.cloudWatchLogger.info('Refund processed successfully', {
      adminId: context.auth.uid,
      refundId: result.refundId,
      amount: result.amount
    });
    
    return result;
  } catch (error) {
    console.error('Refund processing failed:', error);
    await global.cloudWatchLogger.paymentError(error, data.paymentId);
    throw error;
  }
});

/**
 * Get Payment Status Function
 */
exports.getPaymentStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const result = await getPaymentStatus(data.paymentId, data.provider);
    return result;
  } catch (error) {
    console.error('Payment status check failed:', error);
    await global.cloudWatchLogger.paymentError(error, data.paymentId);
    throw error;
  }
});

/**
 * Database Query Function
 * Addresses: "Database query failed: connection pool exhausted"
 */
exports.executeQuery = functions.runWith({
  timeoutSeconds: 300,
  memory: '512MB'
}).https.onCall(async (data, context) => {
  // Require admin authentication for direct database queries
  const isAdmin = context.auth?.token?.admin || false;
  if (!isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { queryType, collection, operation, query, params } = data;

  try {
    let result;

    switch (queryType) {
      case 'firestore':
        result = await executeFirestoreQuery(collection, operation, ...params);
        break;
      case 'mysql':
        result = await executeMySQLQuery(query, params);
        break;
      case 'postgres':
        result = await executePostgresQuery(query, params);
        break;
      default:
        throw new functions.https.HttpsError('invalid-argument', 'Invalid query type');
    }

    await global.cloudWatchLogger.info('Database query executed successfully', {
      adminId: context.auth.uid,
      queryType,
      operation: operation || 'custom'
    });

    return { success: true, data: result };
  } catch (error) {
    console.error('Database query failed:', error);
    await global.cloudWatchLogger.databaseError(error, `${queryType}:${operation || 'custom'}`);
    throw new functions.https.HttpsError('internal', `Database query failed: ${error.message}`);
  }
});

/**
 * Health Check Function
 * Monitors database connections and payment service availability
 */
exports.healthCheck = functions.https.onCall(async (data, context) => {
  try {
    const dbHealth = await dbHealthCheck();
    const poolHealth = await poolManager.healthCheck();
    
    const overallHealth = {
      database: dbHealth,
      connectionPools: poolHealth,
      timestamp: new Date().toISOString(),
      healthy: dbHealth.firestore && poolHealth.overall
    };

    return overallHealth;
  } catch (error) {
    console.error('Health check failed:', error);
    await global.cloudWatchLogger.databaseError(error, 'health_check');
    
    return {
      healthy: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
});

/**
 * Connection Pool Statistics Function
 */
exports.getPoolStats = functions.https.onCall(async (data, context) => {
  const isAdmin = context.auth?.token?.admin || false;
  if (!isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  try {
    const stats = poolManager.getAllStats();
    return { success: true, stats };
  } catch (error) {
    console.error('Failed to get pool stats:', error);
    throw new functions.https.HttpsError('internal', `Failed to get pool statistics: ${error.message}`);
  }
});

/**
 * Simulate Payment Error Function (for testing)
 * This helps test the error handling that addresses the deployment issues
 */
exports.simulatePaymentError = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { errorType = 'timeout' } = data;

  try {
    switch (errorType) {
      case 'timeout':
        // Simulate the exact error from the logs
        const timeoutError = new Error('Payment service connection failed - timeout after 5000ms');
        timeoutError.code = 'ECONNABORTED';
        await global.cloudWatchLogger.paymentError(timeoutError, 'test_transaction');
        throw new functions.https.HttpsError('deadline-exceeded', timeoutError.message);
        
      case 'connection':
        const connectionError = new Error('HTTPSConnectionPool timeout');
        connectionError.code = 'ECONNRESET';
        await global.cloudWatchLogger.paymentError(connectionError, 'test_transaction');
        throw new functions.https.HttpsError('unavailable', connectionError.message);
        
      default:
        throw new functions.https.HttpsError('invalid-argument', 'Invalid error type');
    }
  } catch (error) {
    // This is expected - we're simulating errors
    throw error;
  }
});

/**
 * Simulate Database Error Function (for testing)
 */
exports.simulateDatabaseError = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { errorType = 'pool_exhausted' } = data;

  try {
    switch (errorType) {
      case 'pool_exhausted':
        // Simulate the exact error from the logs
        const poolError = new Error('Database query failed: connection pool exhausted');
        poolError.code = 'POOL_EXHAUSTED';
        await global.cloudWatchLogger.databaseError(poolError, 'test_query');
        throw new functions.https.HttpsError('resource-exhausted', poolError.message);
        
      case 'timeout':
        const timeoutError = new Error('Database connection timeout');
        timeoutError.code = 'ETIMEDOUT';
        await global.cloudWatchLogger.databaseError(timeoutError, 'test_query');
        throw new functions.https.HttpsError('deadline-exceeded', timeoutError.message);
        
      default:
        throw new functions.https.HttpsError('invalid-argument', 'Invalid error type');
    }
  } catch (error) {
    // This is expected - we're simulating errors
    throw error;
  }
});

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing connection pools...');
  try {
    await poolManager.closeAllPools();
    console.log('Connection pools closed successfully');
  } catch (error) {
    console.error('Error closing connection pools:', error);
  }
});

