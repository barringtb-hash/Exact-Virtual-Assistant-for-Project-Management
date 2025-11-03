/**
 * Guided Form Finalize API
 *
 * Generates the final document from captured form data.
 * Supports Google Doc, DOCX, and PDF export.
 */

import { renderDocument } from '../../lib/doc/render.js';
import { validateDocument } from '../../lib/doc/validation.js';
import { logAudit } from '../../lib/doc/audit.js';
import { getDocTypeConfig } from '../../lib/doc/registry.js';

/**
 * Main handler
 */
export default async function handler(req, res) {
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
      conversation_state: conversationState,
      doc_type: docType = 'charter',
      output_format: outputFormat = 'docx',
      google_drive: googleDriveOptions = null
    } = req.body;

    if (!conversationState || !conversationState.answers) {
      return res.status(400).json({
        error: 'Conversation state with answers required'
      });
    }

    // Transform answers to document format
    const documentData = conversationState.answers;

    // Get document configuration
    const config = getDocTypeConfig(docType);
    if (!config) {
      return res.status(400).json({
        error: `Unsupported document type: ${docType}`
      });
    }

    // Validate against schema
    const validation = await validateDocument(docType, config, documentData);

    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Validation failed',
        errors: validation.errors,
        warnings: validation.warnings
      });
    }

    // Render document
    let result;

    if (googleDriveOptions && googleDriveOptions.enabled) {
      // Google Drive generation (to be implemented)
      result = await generateGoogleDoc(documentData, docType, googleDriveOptions);
    } else {
      // Standard DOCX/PDF generation
      result = await renderDocument(docType, documentData, outputFormat);
    }

    // Log audit trail
    await logAudit({
      event: 'guided_form_completed',
      doc_type: docType,
      output_format: outputFormat,
      metadata: {
        field_count: Object.keys(documentData).length,
        required_gaps: conversationState.flags?.has_required_gaps || false,
        total_re_asks: conversationState.metadata?.total_re_asks || 0,
        duration_ms: conversationState.metadata?.started_at
          ? Date.now() - new Date(conversationState.metadata.started_at).getTime()
          : null
      }
    });

    return res.status(200).json({
      success: true,
      document: result,
      metadata: {
        validation_warnings: validation.warnings || [],
        field_metrics: conversationState.metadata?.field_metrics || {}
      }
    });

  } catch (error) {
    console.error('Guided form finalize error:', error);
    return res.status(500).json({
      error: 'Failed to generate document',
      message: error.message
    });
  }
}

/**
 * Generate Google Doc (placeholder for Google Drive integration)
 */
async function generateGoogleDoc(documentData, docType, options) {
  // TODO: Implement Google Drive integration
  // This would:
  // 1. Copy the charter template from Google Drive
  // 2. Replace placeholders with documentData values
  // 3. Share with specified users
  // 4. Return the document URL

  throw new Error('Google Drive integration not yet implemented. Use DOCX or PDF format.');
}

// Export for Vercel
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};
