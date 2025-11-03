/**
 * Guided Form Preview Component
 *
 * Shows a preview of all captured form data.
 */

import React from 'react';

interface GuidedFormPreviewProps {
  conversationState: any;
  onClose: () => void;
}

export const GuidedFormPreview: React.FC<GuidedFormPreviewProps> = ({
  conversationState,
  onClose
}) => {
  if (!conversationState || !conversationState.answers) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">No data to preview yet.</p>
      </div>
    );
  }

  const { answers, skipped, flags } = conversationState;

  const formatValue = (value: any): string => {
    if (Array.isArray(value)) {
      return value.map((item, index) => {
        if (typeof item === 'object') {
          return `${index + 1}. ${Object.values(item).join(' | ')}`;
        }
        return `${index + 1}. ${item}`;
      }).join('\n');
    }

    if (typeof value === 'object' && value !== null) {
      return Object.entries(value)
        .map(([key, val]) => `${key}: ${val}`)
        .join(', ');
    }

    return String(value);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <h2 className="text-xl font-bold text-gray-900">Preview</h2>
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
        >
          Close Preview
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Warnings */}
          {flags?.has_required_gaps && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm font-medium text-yellow-800">
                ⚠️ Some required fields are still empty
              </p>
            </div>
          )}

          {/* Completed Fields */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              ✓ Completed Fields
            </h3>
            <div className="space-y-4">
              {Object.keys(answers).length === 0 ? (
                <p className="text-gray-500 italic">No fields completed yet</p>
              ) : (
                Object.entries(answers).map(([fieldId, value]) => (
                  <div
                    key={fieldId}
                    className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                  >
                    <h4 className="text-sm font-medium text-gray-700 mb-2 capitalize">
                      {fieldId.replace(/_/g, ' ')}
                    </h4>
                    <div className="text-sm text-gray-900 whitespace-pre-wrap">
                      {formatValue(value)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Skipped Fields */}
          {skipped && skipped.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                ⊘ Skipped Fields
              </h3>
              <div className="bg-gray-100 rounded-lg p-4">
                <ul className="list-disc list-inside space-y-1">
                  {skipped.map((fieldId: string) => (
                    <li key={fieldId} className="text-sm text-gray-700 capitalize">
                      {fieldId.replace(/_/g, ' ')}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Metadata */}
          {conversationState.metadata && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                📊 Session Info
              </h3>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="font-medium text-blue-900">Started:</span>
                    <span className="ml-2 text-blue-700">
                      {conversationState.metadata.started_at
                        ? new Date(conversationState.metadata.started_at).toLocaleString()
                        : 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-blue-900">Re-asks:</span>
                    <span className="ml-2 text-blue-700">
                      {conversationState.metadata.total_re_asks || 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
