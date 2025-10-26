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
import HealthCheck from "@/pages/HealthCheck.vue";

import {auth} from './firebase';
import { getUserPerms } from "./helpers";
import { serverLogger } from './utils/serverLogger';
import { cloudWatchLogger } from './utils/cloudWatchLogger';
import { healthMonitor } from './utils/healthMonitor';
import '@mdi/font/css/materialdesignicons.css';
import '@/assets/override.css';

// Initialize health monitoring
const initializeHealthMonitoring = () => {
  try {
    // Log application startup
    cloudWatchLogger.info('Application starting up', {
      type: 'application_lifecycle',
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    }).catch(error => {
      console.log('Failed to log application startup:', error);
    });

    // Start health monitoring in production
    if (process.env.NODE_ENV === 'production') {
      setTimeout(() => {
        healthMonitor.startMonitoring();
      }, 5000); // 5 second delay
    }
  } catch (error) {
    console.warn('Failed to initialize health monitoring:', error);
  }
};

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
    path: "/health",
    component: HealthCheck,
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
  // Log page navigation with enhanced error handling
  try {
    const result = await cloudWatchLogger.logNavigation(from.path, to.path, {
      needsAuth: to.matched.some(record => record.meta.authRequired),
      hasPerms: to.matched.find(record => record.meta.permsRequired)?.meta?.permsRequired ? true : false
    });
    
    // Log navigation failures for debugging
    if (!result.success) {
      console.log('Navigation logging failed:', result.error);
    }
  } catch (error) {
    console.log('Failed to log navigation:', error);
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

// Log successful page views with enhanced error handling
router.afterEach(async (to, from) => {
  try {
    const result = await cloudWatchLogger.logPageView(to.name || to.path, {
      from: from.path,
      to: to.path,
      params: to.params,
      query: to.query
    });
    
    // Log page view failures for debugging
    if (!result.success) {
      console.log('Page view logging failed:', result.error);
    }
  } catch (error) {
    console.log('Failed to log page view:', error);
  }
});

const vuetify = createVuetify({
  components,
  directives
});

const app = createApp(App);

// Enhanced global error handler for Vue
app.config.errorHandler = (err, vm, info) => {
  console.error('Vue Error:', err);
  console.error('Component:', vm);
  console.error('Info:', info);
  
  // Log to CloudWatch with enhanced error handling
  cloudWatchLogger.componentError(
    err, 
    vm?.$options?.name || 'Unknown', 
    info || 'unknown'
  ).then(result => {
    if (!result.success) {
      console.error('Failed to log Vue error to CloudWatch:', result.error);
    }
  }).catch(logError => {
    console.error('Failed to log Vue error to CloudWatch:', logError);
  });
};

// Enhanced global unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled Promise Rejection:', event.reason);
  
  // Log to CloudWatch with enhanced error handling
  cloudWatchLogger.error(
    `Unhandled Promise Rejection: ${event.reason}`,
    {
      type: 'promise_rejection',
      url: window.location.href,
      userAgent: navigator.userAgent,
      stack: event.reason?.stack
    }
  ).then(result => {
    if (!result.success) {
      console.error('Failed to log promise rejection to CloudWatch:', result.error);
    }
  }).catch(logError => {
    console.error('Failed to log promise rejection to CloudWatch:', logError);
  });
});

// Enhanced global activity logging - creates nginx log entries
window.addEventListener('click', async (event) => {
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
});

// Enhanced form submission logging
window.addEventListener('submit', async (event) => {
  try {
    const result = await cloudWatchLogger.logUserAction('Form Submission', {
      formId: event.target.id,
      formClass: event.target.className,
      action: event.target.action
    });
    
    if (!result.success) {
      console.log('Form submission logging failed:', result.error);
    }
  } catch (error) {
    console.log('Failed to log form submission:', error);
  }
});

// Enhanced authentication state change logging
auth.onAuthStateChanged(async (user) => {
  try {
    let result;
    if (user) {
      result = await cloudWatchLogger.logUserAction('User Signed In', {
        userId: user.uid,
        email: user.email,
        provider: user.providerData[0]?.providerId
      });
    } else {
      result = await cloudWatchLogger.logUserAction('User Signed Out', {
        timestamp: new Date().toISOString()
      });
    }
    
    if (!result.success) {
      console.log('Auth state change logging failed:', result.error);
    }
  } catch (error) {
    console.log('Failed to log auth state change:', error);
  }
});

// Enhanced global JavaScript error handler
window.addEventListener('error', (event) => {
  console.error('Global JavaScript Error:', event.error);
  
  // Log to CloudWatch with enhanced error handling
  cloudWatchLogger.error(
    `Global JavaScript Error: ${event.error?.message || event.message}`,
    {
      type: 'javascript_error',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      url: window.location.href,
      stack: event.error?.stack
    }
  ).then(result => {
    if (!result.success) {
      console.error('Failed to log JS error to CloudWatch:', result.error);
    }
  }).catch(logError => {
    console.error('Failed to log JS error to CloudWatch:', logError);
  });
});

// Initialize health monitoring
initializeHealthMonitoring();

app.use(router);
app.use(vuetify);
app.mount("#app")
