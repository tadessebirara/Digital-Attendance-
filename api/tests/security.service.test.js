const { logLoginAttempt, checkLockThreshold } = require('../src/services/security.service');
const { query } = require('../src/config/database');

// Mock Database
jest.mock('../src/config/database', () => ({
  query: jest.fn()
}));

describe('Security Service Hardening Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('logLoginAttempt should insert record into DB', async () => {
    const payload = {
      email: 'test@example.com',
      ip: '127.0.0.1',
      status: 'FAILED',
      reason: 'Wrong password'
    };
    
    await logLoginAttempt(payload);
    
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO login_attempts'),
      expect.arrayContaining([null, payload.email, payload.ip, null, undefined, payload.status, payload.reason])
    );
  });

  test('checkLockThreshold should lock account after 3 failures', async () => {
    // Mock recent failures = 3
    query.mockResolvedValueOnce({ rows: [{ count: '3' }] });
    // Mock user update
    query.mockResolvedValueOnce({ rows: [] });
    // Mock security alert insert
    query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    // Mock admin fetch
    query.mockResolvedValueOnce({ rows: [] });

    const failCount = await checkLockThreshold(123, 'victim@example.com', '192.168.1.1', null);
    
    expect(failCount).toBe(3);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET account_locked_until'),
      expect.any(Array)
    );
  });
});
