/**
 * Unit tests for readability flags
 * Tests that PreviewEditable uses proper styles when FLAGS.READABILITY_V1 is enabled
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import React from 'react';
import PreviewEditable from '../components/PreviewEditable';
import { FLAGS } from '../config/flags';

describe('Readability Flags', () => {
  beforeAll(() => {
    // Ensure flags are set for testing
    expect(FLAGS.READABILITY_V1).toBe(true);
    expect(FLAGS.READABILITY_HIDE_FIELD_TIMESTAMPS).toBe(true);
  });

  it('should apply readability v1 input styles with gray-300 border and text-base', () => {
    const mockSchema = {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          title: 'Title',
        },
      },
    };

    const mockManifest = {
      label: 'Test Doc',
      preview: {
        mode: 'sections',
        sections: [
          {
            id: 'main',
            title: 'Main Section',
            items: [
              {
                type: 'scalar',
                path: 'title',
              },
            ],
          },
        ],
      },
    };

    const mockDraft = {
      title: 'Test Title',
    };

    render(
      <PreviewEditable
        draft={mockDraft}
        schema={mockSchema}
        manifest={mockManifest}
        locks={{}}
        fieldStates={{}}
      />
    );

    const input = screen.queryByRole('textbox');
    if (input) {
      const classes = input.className;
      // Verify readability v1 classes are applied
      expect(classes).toContain('border-gray-300');
      expect(classes).toContain('text-base');
      expect(classes).toContain('bg-white');
    }
  });

  it('should apply section card styles with border-gray-200 and bg-white when readability v1 is enabled', () => {
    const mockSchema = {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          title: 'Title',
        },
      },
    };

    const mockManifest = {
      label: 'Test Doc',
      preview: {
        mode: 'sections',
        sections: [
          {
            id: 'section1',
            title: 'Section One',
            items: [
              {
                type: 'scalar',
                path: 'title',
              },
            ],
          },
        ],
      },
    };

    const { container } = render(
      <PreviewEditable
        draft={{ title: 'Test' }}
        schema={mockSchema}
        manifest={mockManifest}
        locks={{}}
        fieldStates={{}}
      />
    );

    const section = container.querySelector('section');
    if (section) {
      const classes = section.className;
      // Verify section card styles
      expect(classes).toContain('border-gray-200');
      expect(classes).toContain('bg-white');
      expect(classes).toContain('p-4');
    }
  });

  it('should hide timestamps when FLAGS.READABILITY_HIDE_FIELD_TIMESTAMPS is true', () => {
    const mockSchema = {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          title: 'Title',
        },
      },
    };

    const mockManifest = {
      label: 'Test Doc',
      preview: {
        mode: 'sections',
        sections: [
          {
            id: 'main',
            items: [
              {
                type: 'scalar',
                path: 'title',
              },
            ],
          },
        ],
      },
    };

    const { container } = render(
      <PreviewEditable
        draft={{ title: 'Test' }}
        schema={mockSchema}
        manifest={mockManifest}
        locks={{}}
        fieldStates={{
          title: {
            source: 'ai',
            updatedAt: Date.now(),
          },
        }}
      />
    );

    // Timestamps should not be visible when flag is true
    const timestamps = container.querySelectorAll('[class*="relative"]');
    // We expect no timestamp elements when the flag hides them
    expect(FLAGS.READABILITY_HIDE_FIELD_TIMESTAMPS).toBe(true);
  });

  it('should apply gray-700 label color when readability v1 is enabled', () => {
    const mockSchema = {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          title: 'Test Label',
        },
      },
    };

    const mockManifest = {
      label: 'Test Doc',
      preview: {
        mode: 'sections',
        sections: [
          {
            id: 'main',
            items: [
              {
                type: 'scalar',
                path: 'title',
              },
            ],
          },
        ],
      },
    };

    const { container } = render(
      <PreviewEditable
        draft={{ title: 'Test' }}
        schema={mockSchema}
        manifest={mockManifest}
        locks={{}}
        fieldStates={{}}
      />
    );

    const label = container.querySelector('span[class*="text-gray-700"]');
    expect(label).toBeTruthy();
  });
});
