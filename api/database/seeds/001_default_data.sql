-- Default data for Digital Attendance System
-- Password for all default accounts: Admin@123 (admin), Hr@123 (hr), Employee@123 (employee)

-- Insert default admin user
INSERT INTO users (email, password, first_name, last_name, role, status, employee_id) 
VALUES ('admin@system.com', '$2a$12$Jz2uagTwOelzQAPeQBt1RubsebNSR6.hOAP2TGIK.GDC5f/rAhZZa', 'System', 'Administrator', 'ADMIN', 'ACTIVE', 'EMP001')
ON CONFLICT (email) DO NOTHING;

-- Insert default HR user
INSERT INTO users (email, password, first_name, last_name, role, status, employee_id, department) 
VALUES ('hr@company.com', '$2a$12$23nXjAjWQ4R3jjJl.vovJemTLOmYpdEdzukTfkswNMaoLJusGCh4W', 'HR', 'Manager', 'HR', 'ACTIVE', 'EMP002', 'Human Resources')
ON CONFLICT (email) DO NOTHING;

-- Insert sample employee
INSERT INTO users (email, password, first_name, last_name, role, status, employee_id, department, position) 
VALUES ('employee@company.com', '$2a$12$Qb6F3qDKGybEeD65Y9PMOuyvkaaFb1ku6GBTtnVqApV2plqxCq7B2', 'John', 'Doe', 'EMPLOYEE', 'ACTIVE', 'EMP003', 'Engineering', 'Software Engineer')
ON CONFLICT (email) DO NOTHING;

-- Insert default office (coordinates 0,0 — admin must update via Office Management)
INSERT INTO offices (name, latitude, longitude, radius_meters, is_active)
VALUES ('Main Office', 0.0, 0.0, 200, TRUE)
ON CONFLICT DO NOTHING;

-- Insert default attendance rules
INSERT INTO attendance_rules (rule_name, rule_type, description, condition_json, action_json, priority) 
VALUES 
    ('WORKING_HOURS', 'TIME', 'Standard working hours', '{"start_time": "09:00", "end_time": "17:00"}', '{"mark_late_after": "09:15"}', 100),
    ('LATE_THRESHOLD', 'TIME', 'Late threshold in minutes', '{"threshold_minutes": 15}', '{"status": "LATE"}', 90),
    ('GPS_RADIUS', 'LOCATION', 'GPS radius for check-in', '{"radius_meters": 100}', '{"require_gps": true}', 80),
    ('DEVICE_TRUST', 'SECURITY', 'Device trust requirements', '{"require_approval": true, "allow_multiple_devices": false}', '{"enforce_device_binding": true}', 70),
    ('OVERTIME_CALCULATION', 'TIME', 'Overtime calculation rules', '{"standard_hours": 8, "overtime_multiplier": 1.5}', '{"calculate_overtime": true}', 60)
ON CONFLICT (rule_name) DO NOTHING;

-- Insert default system settings
INSERT INTO system_settings (setting_key, setting_value, description) 
VALUES 
    ('COMPANY_NAME', 'Alyah Smart Attendance', 'Company name'),
    ('TIMEZONE', 'UTC', 'System timezone'),
    ('DATE_FORMAT', 'YYYY-MM-DD', 'Date format'),
    ('TIME_FORMAT', '24H', 'Time format (12H or 24H)'),
    ('CURRENCY', 'USD', 'Currency for payroll'),
    ('LANGUAGE', 'en', 'Default language'),
    ('MAX_LOGIN_ATTEMPTS', '5', 'Maximum failed login attempts before lockout'),
    ('LOCKOUT_DURATION_MINUTES', '30', 'Account lockout duration in minutes')
ON CONFLICT (setting_key) DO NOTHING;
