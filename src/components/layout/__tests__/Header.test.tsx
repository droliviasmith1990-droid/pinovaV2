/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { Header } from '../Header';

// Mock dependencies
jest.mock('lucide-react', () => ({
    Save: () => <svg data-testid="icon-save" />,
    Upload: () => <svg data-testid="icon-upload" />,
    Settings: () => <svg data-testid="icon-settings" />,
}));

jest.mock('@/stores/templateStore', () => ({
    useTemplateStore: jest.fn((selector) => selector({
        templateName: 'Untitled Template',
        setTemplateName: jest.fn(),
        templateId: '123',
        isNewTemplate: false,
        setIsNewTemplate: jest.fn(),
        isSaving: false,
        setIsSaving: jest.fn(),
        setTemplateId: jest.fn(),
    })),
}));

jest.mock('@/stores/editorStore', () => ({
    useEditorStore: Object.assign(
        jest.fn((selector) => selector({
            backgroundColor: '#ffffff',
            canvasSize: { width: 800, height: 600 },
            elements: [],
            previewMode: false,
            setPreviewMode: jest.fn(),
        })),
        { setState: jest.fn() }
    ),
}));

jest.mock('@/hooks/useStageRef', () => ({
    useStageRef: () => ({ current: null }),
}));

jest.mock('@/lib/auth/AuthContext', () => ({
    useAuth: () => ({
        currentUser: { id: 'user1', email: 'test@example.com' },
    }),
}));

jest.mock('sonner', () => ({
    toast: {
        success: jest.fn(),
        error: jest.fn(),
    },
}));

jest.mock('@/components/ui/AutoSaveIndicator', () => ({
    AutoSaveIndicator: () => <div data-testid="auto-save-indicator" />,
}));

jest.mock('@/hooks/useAutoSave', () => ({
    useAutoSave: () => ({
        status: 'saved',
        lastSavedAt: new Date(),
        isDirty: false,
        errorMessage: null,
        autoSaveEnabled: true
    })
}));

// Mock ResizeObserver for Headless UI/Radix
global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
};

describe('Header Accessibility', () => {
    it('should have accessible labels for all interactive elements', () => {
        render(<Header />);

        // 1. Back to Dashboard Link
        const backLink = screen.getByLabelText('Back to Dashboard');
        expect(backLink).toBeInTheDocument();
        expect(backLink).toHaveAttribute('href', '/dashboard');

        // 2. Settings Link
        const settingsLink = screen.getByLabelText('Settings');
        expect(settingsLink).toBeInTheDocument();
        expect(settingsLink).toHaveAttribute('href', '/settings');

        // 3. User Profile Button
        const userButton = screen.getByLabelText('User Profile');
        expect(userButton).toBeInTheDocument();

        // 4. Preview Toggle (Checkbox)
        const previewToggle = screen.getByLabelText('Toggle preview mode');
        expect(previewToggle).toBeInTheDocument();
        expect(previewToggle).toHaveAttribute('type', 'checkbox');
    });

    it('should show user initial in profile button', () => {
        render(<Header />);
        // 'test@example.com' -> 'T'
        expect(screen.getByText('T')).toBeInTheDocument();
    });
});
