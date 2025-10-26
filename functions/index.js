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

admin.initializeApp();

// Enhanced database connection management for Firebase Functions
const connectionConfig = {
  maxRetries: 3,
  retryDelay: 1000,
  timeout: 30000,
  maxConcurrentOperations: 20 // Higher limit for server-side operations
};

// Database operation wrapper with retry logic
async function executeWithRetry(operation, context = 'unknown', retries = connectionConfig.maxRetries) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Set timeout for the operation
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Database operation timeout after ${connectionConfig.timeout}ms`));
        }, connectionConfig.timeout);
      });

      const result = await Promise.race([operation(), timeoutPromise]);
      return result;
    } catch (error) {
      console.warn(`Database operation failed (${context}, attempt ${attempt}/${retries}):`, error);
      
      if (attempt === retries) {
        throw new Error(`Database operation failed after ${retries} attempts: ${error.message}`);
      }
      
      // Exponential backoff
      const delay = connectionConfig.retryDelay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

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

    try {
        const currentClaims = await executeWithRetry(
            () => admin.auth().getUser(uid).then(user => user.customClaims || {}),
            'get_user_claims'
        );
        
        const roles = currentClaims?.roles || [];
        roles.push(role);
        currentClaims.roles = roles;

        await executeWithRetry(
            () => admin.auth().setCustomUserClaims(uid, currentClaims),
            'set_custom_claims'
        );
        
        const userRecord = await executeWithRetry(
            () => admin.auth().getUser(uid),
            'get_user_record'
        );
        
        return {
            uid: userRecord.uid,
            email: userRecord.email,
            displayName: userRecord.displayName,
            claims: userRecord.customClaims,
        };
    } catch (error) {
        console.error('Error in addRole function:', error);
        throw new functions.https.HttpsError('internal', `Failed to add role: ${error.message}`);
    }
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
    
    try {
        const currentClaims = await executeWithRetry(
            () => admin.auth().getUser(uid).then(user => user.customClaims),
            'get_user_claims'
        );

        const roles = currentClaims?.roles ?? [];
        console.log("INDEX", roles.indexOf(role));
        roles.splice(roles.indexOf(role), 1);
        currentClaims.roles = roles;

        await executeWithRetry(
            () => admin.auth().setCustomUserClaims(uid, currentClaims),
            'set_custom_claims'
        );
        
        const userRecord = await executeWithRetry(
            () => admin.auth().getUser(uid),
            'get_user_record'
        );
        
        return {
            uid: userRecord.uid,
            email: userRecord.email,
            displayName: userRecord.displayName,
            claims: userRecord.customClaims,
        };
    } catch (error) {
        console.error('Error in removeRole function:', error);
        throw new functions.https.HttpsError('internal', `Failed to remove role: ${error.message}`);
    }
});

exports.searchUsers = functions.https.onCall(async (data, context) => {
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

    try {
        const records = await executeWithRetry(
            () => admin.auth().getUsers(uids),
            'get_users'
        );
        
        return {users: records.users.map((userRecord) => {
            return {
                uid: userRecord.uid,
                email: userRecord.email,
                displayName: userRecord.displayName,
                claims: userRecord.customClaims,
            };
        })};
    } catch (error) {
        console.error('Error in searchUsers function:', error);
        throw new functions.https.HttpsError('internal', `Failed to search users: ${error.message}`);
    }
});

exports.addAdmin = functions.https.onCall(async (data, context) => {
    const uid = data.uid;
    const isAdmin = context.auth.token.admin || false;
    if (!isAdmin) {
        return {message: "You must be an admin to add another admin user"};
    }
    if (!uid) {
        return {message: "Please pass a UID to the function"};
    }
    
    try {
        await executeWithRetry(
            () => admin.auth().setCustomUserClaims(uid, {admin: true}),
            'set_admin_claims'
        );
        
        return {message: "User added as admin"};
    } catch (error) {
        console.error('Error in addAdmin function:', error);
        throw new functions.https.HttpsError('internal', `Failed to add admin: ${error.message}`);
    }
});

exports.removeAdmin = functions.https.onCall(async (data, context) => {
    const uid = data.uid;
    const isAdmin = context.auth.token.admin || false;
    if (!isAdmin) {
        return {message: "You must be an admin to remove another admin user"};
    }
    if (!uid) {
        return {message: "Please pass a UID to the function"};
    }
    
    try {
        await executeWithRetry(
            () => admin.auth().setCustomUserClaims(uid, {admin: false}),
            'remove_admin_claims'
        );
        
        return {message: "User removed as admin"};
    } catch (error) {
        console.error('Error in removeAdmin function:', error);
        throw new functions.https.HttpsError('internal', `Failed to remove admin: ${error.message}`);
    }
});

exports.getEventAttendance = functions.https.onCall(async (data, context) => {
    const eventId = data.id;
    const isAdmin = context.auth.token.admin || false;
    if (!isAdmin) {
        return {message: "You must be an admin to see event statistics"};
    }
    if (!eventId) {
        return {message: "Please pass an event id to the function"};
    }

    try {
        const regRef = firestore().collection("registrations");
        const registrations = await executeWithRetry(
            () => regRef.where("event", "==", eventId).count().get(),
            'get_event_attendance'
        );

        return registrations.data().count;
    } catch (error) {
        console.error('Error in getEventAttendance function:', error);
        throw new functions.https.HttpsError('internal', `Failed to get event attendance: ${error.message}`);
    }
});

exports.getUserAttendance = functions.https.onCall(async (data, context) => {
    const userId = data.id;
    const auth = context.auth;
    if (!auth) {
        return {message: "You must be logged in to call this function", code: 401};
    }

    try {
        const regRef = firestore().collection("registrations");
        const attRef = await executeWithRetry(
            () => regRef.where("uid", "==", userId).count().get(),
            'get_user_attendance'
        );
        
        return attRef.data().count;
    } catch (error) {
        console.error('Error in getUserAttendance function:', error);
        throw new functions.https.HttpsError('internal', `Failed to get user attendance: ${error.message}`);
    }
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
    try {
        const eventRef = firestore().collection("events");

        // Initialize Slack App
        // const app = new App({
        //     token: slackBotToken,
        //     signingSecret: slackSigningSecret,
        //     socketMode: true,
        //     appToken: slackAppToken,
        // });
        
        // Get upcoming events with retry logic
        let workshop = await executeWithRetry(
            () => eventRef.where("startDate", ">=", admin.firestore.Timestamp.fromMillis(new Date().getTime() + 60 * 60 * 7 * 1000))
                          .where("startDate", "<=", (admin.firestore.Timestamp.fromMillis(new Date().getTime() + 60 * 60 * (24+7) * 1000)))
                          .orderBy("startDate", "asc")
                          .get(),
            'get_upcoming_events'
        );

        if (workshop.empty) {
            return "No Data";
        }

        // Send Messages
        for (const doc of workshop.docs) {
            var hasFlyer = false;
            if (doc.data().flyer) {
                hasFlyer = true;
                var flyer = await executeWithRetry(
                    () => admin.storage().bucket().file(doc.data().flyer).download(),
                    'download_flyer'
                );
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

            // Send message to Discord with retry logic
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
            await executeWithRetry(
                () => new Promise((resolve, reject) => {
                    request({
                        "method": "POST",
                        "url": discordWebhook,
                        "formData": formdata,
                        "timeout": connectionConfig.timeout
                    }, function(error, response) {
                        if (error) {
                            reject(new Error(error));
                        } else {
                            console.log(response.body);
                            resolve(response);
                        }
                    });
                }),
                'send_discord_message'
            );
            // await slackResult;
        }
        return "done";
    } catch (error) {
        console.error('Error in sendEventMessages:', error);
        throw new Error(`Failed to send event messages: ${error.message}`);
    }
}       

exports.sendWelcomeEmail = functions.runWith({secrets: ["mailAppPassword"]})
.https.onCall(async (data, context) => {
    const { email, firstName } = data;

    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: 'santaclara.acm@gmail.com',
                pass: process.env.mailAppPassword,
            },
            // Add connection timeout and retry settings
            connectionTimeout: connectionConfig.timeout,
            greetingTimeout: connectionConfig.timeout,
            socketTimeout: connectionConfig.timeout,
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

        await executeWithRetry(
            () => transporter.sendMail(mailOptions),
            'send_welcome_email'
        );
        
        return { success: true };
    } catch (error) {
        console.error('Error sending email:', error);
        throw new functions.https.HttpsError('internal', `Failed to send email: ${error.message}`);
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

