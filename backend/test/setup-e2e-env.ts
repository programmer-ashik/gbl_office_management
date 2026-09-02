process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.MONGODB_MEMORY = 'true';
process.env.MONGODB_URI =
  process.env.MONGODB_URI ?? 'mongodb://localhost:27017/gbl_office_test';
process.env.JWT_ACCESS_SECRET = 'e2e-access-secret-key-32-chars-min';
process.env.JWT_REFRESH_SECRET = 'e2e-refresh-secret-key-32-chars-mn';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.CORS_ORIGIN = 'http://localhost:5173';
process.env.BOOTSTRAP_ADMIN_EMAIL = '';
process.env.BOOTSTRAP_ADMIN_PASSWORD = '';
