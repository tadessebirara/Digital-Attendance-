const request = require('supertest');
const express = require('express');
const bodyParser = require('body-parser');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
const authRoutes = require('../src/modules/auth/auth.routes');
const errorHandler = require('../src/middleware/error.middleware');

// Setup a mock app
const app = express();
app.use(bodyParser.json());
app.use('/api/auth', authRoutes);
app.use(errorHandler);

// Mock controller methods
jest.mock('../src/modules/auth/auth.controller', () => ({
  login: (req, res) => res.json({ success: true, data: { accessToken: 'mock_token' } }),
  register: (req, res) => res.status(201).json({ success: true }),
  forgotPassword: (req, res) => res.json({ success: true, message: 'ok' }),
  validateResetToken: (req, res) => res.json({ success: true, data: { valid: true } }),
  resetPassword: (req, res) => res.json({ success: true, message: 'ok' }),
  getCurrentUser: (req, res) => res.json({ success: true, data: { user: { id: 1 } } }),
  logout: (req, res) => res.json({ success: true, message: 'ok' }),
  refreshToken: (req, res) => res.json({ success: true, data: { accessToken: 'new_token' } }),
  verifyDeviceOtp: (req, res) => res.json({ success: true, data: { accessToken: 'otp_token' } }),
  changePassword: (req, res) => res.json({ success: true, message: 'ok' }),
  getPendingAccounts: (req, res) => res.json({ success: true, data: [] }),
  approveAccount: (req, res) => res.json({ success: true, message: 'ok' }),
  requestDeviceReplacement: (req, res) => res.json({ success: true, message: 'ok' }),
  confirmDeviceReplacement: (req, res) => res.json({ success: true, message: 'ok' }),
  send2FAOtp: (req, res) => res.json({ success: true, message: 'ok' }),
  verify2FAOtp: (req, res) => res.json({ success: true, message: 'ok' }),
  sendRegistrationOtp: (req, res) => res.json({ success: true, message: 'ok' }),
  verifyRegistrationOtp: (req, res) => res.json({ success: true, message: 'ok' }),
  sendActivationOtp: (req, res) => res.json({ success: true, message: 'ok' }),
  verifyActivationOtp: (req, res) => res.json({ success: true, message: 'ok' }),
  completeEmployeeActivation: (req, res) => res.json({ success: true, message: 'ok' }),
}));

describe('Auth Integration Tests (Production Smoke Tests)', () => {
  test('POST /api/auth/login should return 200 with valid data', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
  });

  test('POST /api/auth/login should return 400 for invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'invalid-email', password: 'short' });
    
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Validation failed');
  });
});
