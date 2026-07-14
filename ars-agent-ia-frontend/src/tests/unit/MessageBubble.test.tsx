import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MessageBubble from '@/widget/components/MessageBubble';
import type { Message } from '@/types/conversation';

const makeMsg = (role: Message['role'], content = 'Test message'): Message => ({
  id: 'msg-1',
  conversationId: 'conv-1',
  role,
  content,
  timestamp: new Date().toISOString(),
  tokensUsed: null,
  toolName: null,
});

describe('MessageBubble', () => {
  it('renders user message', () => {
    render(<MessageBubble message={makeMsg('user')} isLast={false} />);
    expect(screen.getByText('Test message')).toBeTruthy();
  });

  it('renders assistant message', () => {
    render(<MessageBubble message={makeMsg('assistant')} isLast={false} />);
    expect(screen.getByText('Test message')).toBeTruthy();
  });

  it('renders system message as centered banner', () => {
    const { container } = render(<MessageBubble message={makeMsg('system', 'Système')} isLast={false} />);
    expect(container.querySelector('.flex.justify-center')).toBeTruthy();
  });

  it('renders multiline content with br elements', () => {
    render(<MessageBubble message={makeMsg('assistant', 'line1\nline2')} isLast={false} />);
    expect(screen.getByText('line1')).toBeTruthy();
    expect(screen.getByText('line2')).toBeTruthy();
  });
});