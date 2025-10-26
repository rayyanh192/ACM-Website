# Firebase Timeout Fix

## Problem
The application was experiencing timeout errors (count: 3) with Firebase operations, particularly with database queries that would hang indefinitely.

## Solution
Added comprehensive timeout handling to Firebase operations:

### Changes Made

#### 1. `src/firebase.js`
- Added `withTimeout()` utility function for wrapping Firebase operations with timeout handling
- Enhanced Firestore database operations with automatic timeout wrappers:
  - Document get operations: 10 second timeout
  - Collection get operations: 15 second timeout
- Configured Firestore settings for better performance and caching

#### 2. `src/helpers.js`
- Enhanced `getUserPerms()` function with comprehensive error handling
- Added try-catch blocks around individual role queries to prevent one failure from breaking the entire permission system
- Added fallback to default permissions when operations fail
- Improved error logging for debugging timeout issues

## Benefits
- Prevents Firebase operations from hanging indefinitely
- Provides meaningful error messages when timeouts occur
- Maintains application functionality even when some Firebase operations fail
- Improves overall application reliability and user experience

## Timeout Values
- Document operations: 10 seconds
- Collection queries: 15 seconds (longer due to potentially larger data sets)
- These values can be adjusted based on application needs and network conditions

## Testing
The fix should resolve the "Example timeout" errors that were occurring. Monitor application logs to ensure timeout errors are eliminated while maintaining normal functionality.