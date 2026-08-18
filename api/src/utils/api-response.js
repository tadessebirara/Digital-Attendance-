/**
 * Standardized API Response structure for Enterprise Mobile & Web integration
 */
class ApiResponse {
  static success(data = {}, message = 'Operation successful') {
    return {
      success: true,
      data,
      message,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  static error(message = 'An error occurred', statusCode = 500, details = null) {
    return {
      success: false,
      data: null,
      message,
      error: {
        code: statusCode,
        details: details || message,
      },
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = ApiResponse;
