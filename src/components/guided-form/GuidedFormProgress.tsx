/**
 * Guided Form Progress Component
 *
 * Displays progress through the form fields.
 */

import React from 'react';
import { useProgress } from '../../state/guidedFormStore';

export const GuidedFormProgress: React.FC = () => {
  const progress = useProgress();

  return (
    <div className="flex items-center space-x-4">
      {/* Progress Bar */}
      <div className="flex-1 min-w-[200px]">
        <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
          <span>Progress</span>
          <span>{progress.completed} of {progress.total} fields</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progress.percentage}%` }}
          ></div>
        </div>
      </div>

      {/* Percentage Badge */}
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 border-2 border-blue-600">
        <span className="text-lg font-bold text-blue-600">
          {progress.percentage}%
        </span>
      </div>
    </div>
  );
};
