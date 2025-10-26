import App from "./App.vue";
import {createRouter, createWebHistory} from "vue-router";
import {createApp} from 'vue';

import 'vuetify/styles';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';

// pages

import IndexHome from "@/pages/IndexHome.vue";
import BoardPage from "@/pages/BoardPage.vue";
import CalendarPage from "@/pages/CalendarPage.vue";
import PrivacyPolicy from "@/pages/PrivacyPolicy.vue";
import Events from "@/pages/EventList.vue";
import JoinUs from "@/pages/JoinUs.vue";
import EditEvent from "@/pages/EditEvent.vue";
import ProfilePage from "@/pages/ProfilePage.vue";
import AdminPage from "@/pages/AdminPage.vue";
import RegisterPage from "@/pages/RegisterPage.vue";
import RedirectRouter from "@/pages/RedirectRouter.vue";
import AdminRoles from '@/pages/AdminRoles.vue';
import AdminStats from "@/pages/AdminStats.vue";
import TestCloudWatch from "@/pages/TestCloudWatch.vue";

import {auth} from './firebase';
import { getUserPerms } from "./helpers";
import { serverLogger } from './utils/serverLogger';
import { cloudWatchLogger } from './utils/cloudWatchLogger';
import { isCloudWatchEnabled } from './config/cloudwatch';
import '@mdi/font/css/materialdesignicons.css';
import '@/assets/override.css';

// Safe logging wrapper that handles CloudWatch failures gracefully
async function safeLog(logFunction, ...args) {
  try {
    await logFunction(...args);
  } catch (error) {
    // Silently fail CloudWatch logging to prevent user experience disruption
    console.log('Logging failed (non-critical):', error.message);
  }
}

const routes = [
  {
    path: "/",
    component: IndexHome,
  },
  {
    path: "/board",
    component: BoardPage,
  },
  {
    path: "/calendar",
    component: CalendarPage,
  },
  {
    path: "/privacy",
    component: PrivacyPolicy,
  },
  {
    path: "/events",
    component: Events,
    meta: {
      authRequired: true,
      permsRequired: [["viewEvents"]]
    },
  },
  {
    path: "/profile",
    component: ProfilePage,
    meta: {
      authRequired: true,
    },
  },
  {
    path: "/register/:id",
    component: RegisterPage,
    permsRequired: [["canRegister"]]
  },
  {
    path: "/admin",
    component: AdminPage,
    meta: {
      authRequired: true,
      permsRequired: [[
        "changeRolePerms",
        "changeUserRole",
        "editMyEvent",
        "deleteMyEvent",
        "acmAddEvent",
        "acmEditEvent",
        "acmDeleteEvent",
        "icpcAddEvent",
        "icpcEditEvent",
        "icpcDeleteEvent",
        "acmwAddEvent",
        "acmwEditEvent",
        "acmwDeleteEvent",
        "broncosecAddEvent",
        "broncosecEditEvent",
        "broncosecDeleteEvent",
        "otherAddEvent",
        "otherEditEvent",
        "otherDeleteEvent",
        "viewAllResume",
        "addProject",
        "editProject",
        "deleteProject"
      ]]
    },
  },
  {
    path: "/admin/roles",
    component: AdminRoles,
    meta: {
      authRequired: true,
      permsRequired: [["changeRolePerms", "changeUserRole"]]
    },
  },
  {
    path: "/admin/events/:id",
    component: EditEvent,
    meta: {
      authRequired: true,
      permsRequired: [[
        "editMyEvent",
        "acmAddEvent",
        "acmEditEvent",
        "acmwAddEvent",
        "acmwEditEvent",
        "icpcAddEvent",
        "icpcEditEvent",
        "broncosecAddEvent",
        "broncosecEditEvent",
        "aicAddEvent",
        "aicEditEvent",
        "otherAddEvent",
        "otherEditEvent",
      ]]
    },
  },
  {
    path: "/admin/stats",
    component: AdminStats,
    meta: {
      authRequired: true,
      permsRequired: [[
        "changeRolePerms",
        "changeUserRole",
        "editMyEvent",
        "deleteMyEvent",
        "acmAddEvent",
        "acmEditEvent",
        "acmDeleteEvent",
        "icpcAddEvent",
        "icpcEditEvent",
        "icpcDeleteEvent",
        "acmwAddEvent",
        "acmwEditEvent",
        "acmwDeleteEvent",
        "broncosecAddEvent",
        "broncosecEditEvent",
        "broncosecDeleteEvent",
        "otherAddEvent",
        "otherEditEvent",
        "otherDeleteEvent",
        "viewAllResume",
        "addProject",
        "editProject",
        "deleteProject"
      ]]
    }
  },
  {
    path: "/joinus",
    component: JoinUs,
  },
  {
    path: "/test-cloudwatch",
    component: TestCloudWatch,
  },
  {
    path: "/redirect",
    component: RedirectRouter,
  },
  {
    path: "/inrix",
    beforeEnter() {
        window.location.replace("https://inrix.scuacm.com")
    }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: "/",
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { left: 0, top: 0 };
  }
});

router.beforeEach( async (to, from) => {
  // Log page navigation with safe logging
  if (isCloudWatchEnabled) {
    safeLog(cloudWatchLogger.logNavigation, from.path, to.path, {
      needsAuth: to.matched.some(record => record.meta.authRequired),
      hasPerms: to.matched.find(record => record.meta.permsRequired)?.meta?.permsRequired ? true : false
    });
  }

  //Check if the page we are going to requires a user to be signed in or admin permissions
  const needsAuth = to.matched.some(record => record.meta.authRequired);
  const needsPerms = to.matched.find(record => record.meta.permsRequired)?.meta?.permsRequired;
  if (!needsAuth) {
    return true;
  }
  const user = await auth.currentUser;
  let valid = false;
  if (user) {
    valid = true;
    if (needsPerms && needsPerms.length > 0) {
      const perms = await getUserPerms(user);
      for (let permGroup of needsPerms) {
        let groupValid = false;
        for (let perm of permGroup) {
          if (perms[perm]) {
            groupValid = true;
          }
        }
        if (!groupValid) {
          // console.log("FAILED for", permGroup, perms)
          valid = false;
        }
      }
    }
  }
  if(valid) {
    return true;
  }

  let path = "/redirect?uri="+encodeURIComponent(to.path);
  if(needsPerms && needsPerms.length > 0) {
    path += "&perms="+encodeURIComponent(needsPerms.map(row => row.join(",")).join(":"))
  }
  return path;
});

// Log successful page views with safe logging
router.afterEach(async (to, from) => {
  if (isCloudWatchEnabled) {
    safeLog(cloudWatchLogger.logPageView, to.name || to.path, {
      from: from.path,
      to: to.path,
      params: to.params,
      query: to.query
    });
  }
});

const vuetify = createVuetify({
  components,
  directives
});

const app = createApp(App);

// Global error handler for Vue
app.config.errorHandler = (err, vm, info) => {
  console.error('Vue Error:', err);
  console.error('Component:', vm);
  console.error('Info:', info);
  
  // Log to CloudWatch with safe logging
  if (isCloudWatchEnabled) {
    safeLog(cloudWatchLogger.componentError, 
      err, 
      vm?.$options?.name || 'Unknown', 
      info || 'unknown'
    );
  }
};

// Store event listener references for cleanup
const eventListeners = {
  unhandledRejection: null,
  click: null,
  submit: null,
  error: null
};

// Global unhandled promise rejection handler
eventListeners.unhandledRejection = (event) => {
  console.error('Unhandled Promise Rejection:', event.reason);
  
  // Log to CloudWatch with safe logging
  if (isCloudWatchEnabled) {
    safeLog(cloudWatchLogger.error,
      `Unhandled Promise Rejection: ${event.reason}`,
      {
        type: 'promise_rejection',
        url: window.location.href,
        userAgent: navigator.userAgent
      }
    );
  }
};

// Global activity logging - creates nginx log entries
eventListeners.click = async (event) => {
  try {
    const target = event.target;
    const tagName = target.tagName.toLowerCase();
    
    // Log button clicks to server (nginx will log the request)
    if (tagName === 'button' || target.classList.contains('v-btn')) {
      await serverLogger.logButtonClick(target.textContent?.trim() || 'Unknown Button');
    }
  } catch (error) {
    console.log('Failed to log click activity:', error);
  }
};

// Log form submissions
eventListeners.submit = async (event) => {
  if (isCloudWatchEnabled) {
    safeLog(cloudWatchLogger.logUserAction, 'Form Submission', {
      formId: event.target.id,
      formClass: event.target.className,
      action: event.target.action
    });
  }
};

// Global JavaScript error handler
eventListeners.error = (event) => {
  console.error('Global JavaScript Error:', event.error);
  
  // Log to CloudWatch with safe logging
  if (isCloudWatchEnabled) {
    safeLog(cloudWatchLogger.error,
      `Global JavaScript Error: ${event.error?.message || event.message}`,
      {
        type: 'javascript_error',
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        url: window.location.href
      }
    );
  }
};

// Add event listeners
window.addEventListener('unhandledrejection', eventListeners.unhandledRejection);
window.addEventListener('click', eventListeners.click);
window.addEventListener('submit', eventListeners.submit);
window.addEventListener('error', eventListeners.error);

// Log authentication state changes
const authStateUnsubscribe = auth.onAuthStateChanged(async (user) => {
  if (isCloudWatchEnabled) {
    if (user) {
      safeLog(cloudWatchLogger.logUserAction, 'User Signed In', {
        userId: user.uid,
        email: user.email,
        provider: user.providerData[0]?.providerId
      });
    } else {
      safeLog(cloudWatchLogger.logUserAction, 'User Signed Out', {
        timestamp: new Date().toISOString()
      });
    }
  }
});

// Cleanup function for when the app is unmounted
window.addEventListener('beforeunload', () => {
  // Remove event listeners
  window.removeEventListener('unhandledrejection', eventListeners.unhandledRejection);
  window.removeEventListener('click', eventListeners.click);
  window.removeEventListener('submit', eventListeners.submit);
  window.removeEventListener('error', eventListeners.error);
  
  // Unsubscribe from auth state changes
  if (authStateUnsubscribe) {
    authStateUnsubscribe();
  }
});

app.use(router);
app.use(vuetify);
app.mount("#app")
