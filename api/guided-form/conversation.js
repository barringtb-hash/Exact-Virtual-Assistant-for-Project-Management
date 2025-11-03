/**
 * Guided Form Conversation API
 *
 * Handles the guided form conversation flow using Claude API
 * and the state machine orchestrator.
 */

const Anthropic = require('@anthropic-ai/sdk');
const { processMessage } = require('../../lib/guided-form/orchestrator');
const {
  buildClaudePrompts,
  formatFieldAsk,
  formatConfirmation,
  formatValidationError,
  formatPreview,
  formatEndReview,
  STOP_SEQUENCES
} = require('../../lib/guided-form/prompts');

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY
});

/**
 * Configuration
 */
const config = {
  model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
  maxTokens: 300,
  temperature: 0.3
};

/**
 * Formats response based on orchestrator action
 */
function formatResponse(result, schema) {
  let message = '';

  switch (result.action) {
    case 'ask_field':
      if (result.message) {
        message = result.message + '\n\n';
      }
      message += formatFieldAsk(result.askField);
      break;

    case 'confirm_value':
      message = formatConfirmation(result.confirming.field, result.confirming.value);
      break;

    case 'validation_error':
      message = formatValidationError(result.askField, result.message);
      break;

    case 'show_preview':
      message = formatPreview(result.preview, schema);
      break;

    case 'end_review':
      message = formatEndReview(result.review, schema);
      break;

    case 'confirm_skip':
    case 'show_help':
    case 'error':
    case 'cancel':
      message = result.message;
      break;

    case 'ask_again':
      message = result.message + '\n\n' + formatFieldAsk(result.askField || result.state.currentField);
      break;

    default:
      message = result.message || 'Continue...';
  }

  return message;
}

/**
 * Calls Claude API with appropriate prompts
 */
async function callClaude(prompts, conversationHistory = []) {
  try {
    // Build messages array
    const messages = [];

    // Add conversation history
    if (conversationHistory && conversationHistory.length > 0) {
      messages.push(...conversationHistory);
    }

    // Add current user message
    messages.push({
      role: 'user',
      content: prompts.user
    });

    // Call Claude
    const response = await anthropic.messages.create({
      model: config.model,
      max_tokens: prompts.max_tokens || config.maxTokens,
      temperature: prompts.temperature || config.temperature,
      system: [
        {
          type: 'text',
          text: prompts.system
        },
        {
          type: 'text',
          text: prompts.developer,
          cache_control: { type: 'ephemeral' }
        }
      ],
      messages,
      stop_sequences: STOP_SEQUENCES
    });

    // Extract text from response
    const content = response.content[0]?.text || '';

    return {
      text: content,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens
      }
    };

  } catch (error) {
    console.error('Claude API error:', error);
    throw new Error(`Claude API failed: ${error.message}`);
  }
}

/**
 * Main handler
 */
module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      message: userMessage,
      conversation_state: conversationState,
      doc_type: docType = 'charter',
      conversation_history: conversationHistory = [],
      use_claude = true
    } = req.body;

    if (!userMessage && !conversationState) {
      return res.status(400).json({
        error: 'Either message or conversation_state required to start'
      });
    }

    // Process through orchestrator
    const result = await processMessage(
      conversationState,
      userMessage || '__INIT__',
      docType
    );

    // Handle system actions that don't need Claude
    const systemActions = ['show_preview', 'show_help', 'error', 'cancel', 'end_review'];

    let assistantMessage = '';
    let claudeResponse = null;

    if (systemActions.includes(result.action)) {
      // Format response directly without calling Claude
      const schema = await require('../../lib/guided-form/orchestrator').loadSchema(docType);
      assistantMessage = formatResponse(result, schema);
    } else if (use_claude) {
      // Use Claude for conversational responses
      const schema = await require('../../lib/guided-form/orchestrator').loadSchema(docType);
      const field = result.askField || result.state.currentField;

      const prompts = buildClaudePrompts(
        field,
        result.state,
        result.action,
        userMessage || 'Start',
        conversationHistory.length > 0 ? conversationHistory[conversationHistory.length - 1].content : null
      );

      claudeResponse = await callClaude(prompts, conversationHistory);
      assistantMessage = claudeResponse.text;
    } else {
      // Fallback to formatted response
      const schema = await require('../../lib/guided-form/orchestrator').loadSchema(docType);
      assistantMessage = formatResponse(result, schema);
    }

    // Build response
    const response = {
      success: true,
      message: assistantMessage,
      conversation_state: result.state,
      action: result.action,
      metadata: {
        current_field: result.askField ? {
          id: result.askField.id,
          label: result.askField.label,
          required: result.askField.required
        } : null,
        progress: {
          current: result.state.current_field_index,
          total: result.state.schema?.fields?.length || 0,
          completed: Object.keys(result.state.answers || {}).length
        }
      }
    };

    if (claudeResponse) {
      response.usage = claudeResponse.usage;
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error('Guided form conversation error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};

// Export for Vercel
module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};
