/**
 * Guided Form API Integration Tests
 *
 * Tests for the API endpoints.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Mock setup
process.env.ANTHROPIC_API_KEY = 'test-key';

test('API: Conversation endpoint - initialization', async () => {
  const { default: conversationHandler } = await import('../api/guided-form/conversation.js');

  const mockReq = {
    method: 'POST',
    body: {
      message: '__INIT__',
      doc_type: 'charter',
      use_claude: false // Disable Claude for testing
    }
  };

  const mockRes = {
    headers: {},
    statusCode: 200,
    responseBody: null,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.responseBody = body;
      return this;
    },
    end() {
      return this;
    }
  };

  await conversationHandler(mockReq, mockRes);

  assert.equal(mockRes.statusCode, 200);
  assert.ok(mockRes.responseBody);
  assert.equal(mockRes.responseBody.success, true);
  assert.equal(mockRes.responseBody.action, 'ask_field');
  assert.ok(mockRes.responseBody.message);
  assert.ok(mockRes.responseBody.conversation_state);
});

test('API: Conversation endpoint - answer field', async () => {
  const { default: conversationHandler } = await import('../api/guided-form/conversation.js');

  // First, initialize
  const initReq = {
    method: 'POST',
    body: {
      message: '__INIT__',
      doc_type: 'charter',
      use_claude: false
    }
  };

  const initRes = {
    headers: {},
    statusCode: 200,
    responseBody: null,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.responseBody = body;
      return this;
    },
    end() {
      return this;
    }
  };

  await conversationHandler(initReq, initRes);
  const conversationState = initRes.responseBody.conversation_state;

  // Now answer the first field
  const answerReq = {
    method: 'POST',
    body: {
      message: 'Test Project Name',
      conversation_state: conversationState,
      doc_type: 'charter',
      use_claude: false
    }
  };

  const answerRes = {
    headers: {},
    statusCode: 200,
    responseBody: null,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.responseBody = body;
      return this;
    },
    end() {
      return this;
    }
  };

  await conversationHandler(answerReq, answerRes);

  assert.equal(answerRes.statusCode, 200);
  assert.equal(answerRes.responseBody.success, true);
  assert.equal(answerRes.responseBody.action, 'confirm_value');
});

test('API: Finalize endpoint - validation', async () => {
  const { default: finalizeHandler } = await import('../api/guided-form/finalize.js');

  const mockReq = {
    method: 'POST',
    body: {
      conversation_state: {
        answers: {
          project_name: 'Test',
          sponsor: 'Jane Doe'
          // Missing required fields
        }
      },
      doc_type: 'charter',
      output_format: 'docx'
    }
  };

  const mockRes = {
    headers: {},
    statusCode: 200,
    responseBody: null,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.responseBody = body;
      return this;
    },
    end() {
      return this;
    }
  };

  await finalizeHandler(mockReq, mockRes);

  // Should fail validation due to missing required fields
  assert.equal(mockRes.statusCode, 400);
  assert.ok(mockRes.responseBody.error);
});

test('API: CORS headers', async () => {
  const { default: conversationHandler } = await import('../api/guided-form/conversation.js');

  const mockReq = {
    method: 'OPTIONS'
  };

  const mockRes = {
    headers: {},
    statusCode: 200,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    end() {
      return this;
    }
  };

  await conversationHandler(mockReq, mockRes);

  assert.equal(mockRes.statusCode, 200);
  assert.ok(mockRes.headers['Access-Control-Allow-Origin']);
  assert.ok(mockRes.headers['Access-Control-Allow-Methods']);
});

test('API: Method not allowed', async () => {
  const { default: conversationHandler } = await import('../api/guided-form/conversation.js');

  const mockReq = {
    method: 'GET'
  };

  const mockRes = {
    headers: {},
    statusCode: 200,
    responseBody: null,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.responseBody = body;
      return this;
    }
  };

  await conversationHandler(mockReq, mockRes);

  assert.equal(mockRes.statusCode, 405);
  assert.ok(mockRes.responseBody.error);
});

console.log('✅ All API tests passed!');
