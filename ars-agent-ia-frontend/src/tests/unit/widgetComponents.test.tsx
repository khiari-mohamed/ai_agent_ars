import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MessageBubble from '@/widget/components/MessageBubble';
import MessageInput from '@/widget/components/MessageInput';
import SentimentPulse from '@/widget/components/SentimentPulse';
import type { Message } from '@/types/conversation';

const msg = (over: Partial<Message> = {}): Message => ({
  id: 'm1',
  conversationId: 'c1',
  role: 'assistant',
  content: 'Salam, kifech nنجم نعاونك',
  timestamp: '2026-11-10T10:00:00.000Z',
  tokensUsed: null,
  toolName: null,
  ...over,
});

describe('MessageBubble', () => {
  it('survives an invalid timestamp', () => {
    render(<MessageBubble message={msg({ timestamp: 'not-a-date', content: 'Bonjour' })} isLast={false} />);
    expect(screen.getByText('Bonjour')).toBeInTheDocument();
  });

  it('renders nothing for tool messages', () => {
    const { container } = render(<MessageBubble message={msg({ role: 'tool' })} isLast={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('toggles to the Arabic-script text for Tunisian replies', async () => {
    const user = userEvent.setup();
    render(
      <MessageBubble
        message={msg({ language: 'tn', content: 'Marhba bik', ttsText: 'مرحبا بيك' })}
        isLast={false}
      />,
    );
    expect(screen.queryByText('مرحبا بيك')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'عرض بالعربية' }));
    expect(screen.getByText('مرحبا بيك')).toBeInTheDocument();
  });

  it('offers no toggle for French replies', () => {
    render(<MessageBubble message={msg({ language: 'fr', content: 'Bonjour', ttsText: 'Bonjour' })} isLast={false} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('MessageInput', () => {
  it('sends on Enter and clears when accepted', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(() => true);
    render(<MessageInput onSend={onSend} />);
    const box = screen.getByLabelText('Message');
    await user.type(box, 'Bonjour{Enter}');
    expect(onSend).toHaveBeenCalledWith('Bonjour');
    expect(box).toHaveValue('');
  });

  it('keeps the text when the send is refused', async () => {
    const user = userEvent.setup();
    render(<MessageInput onSend={() => false} />);
    const box = screen.getByLabelText('Message');
    await user.type(box, 'Bonjour{Enter}');
    expect(box).toHaveValue('Bonjour');
  });

  it('does not send on Shift+Enter', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(() => true);
    render(<MessageInput onSend={onSend} />);
    await user.type(screen.getByLabelText('Message'), 'a{Shift>}{Enter}{/Shift}b');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('blocks sending while busy but still lets the user type', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(() => true);
    render(<MessageInput onSend={onSend} busy />);
    await user.type(screen.getByLabelText('Message'), 'abc{Enter}');
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Message')).toHaveValue('abc');
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled();
  });

  it('is fully disabled when not connected', () => {
    render(<MessageInput onSend={() => true} disabled />);
    expect(screen.getByLabelText('Message')).toBeDisabled();
  });
});

describe('SentimentPulse', () => {
  it('maps the score to the bar width and clamps out-of-range values', () => {
    const { rerender } = render(<SentimentPulse score={0} label="NEUTRE" />);
    expect(screen.getByTestId('sentiment-fill')).toHaveStyle({ width: '50%' });
    rerender(<SentimentPulse score={5} label="SATISFAIT" />);
    expect(screen.getByTestId('sentiment-fill')).toHaveStyle({ width: '100%' });
    rerender(<SentimentPulse score={-5} label="INSATISFAIT" />);
    expect(screen.getByTestId('sentiment-fill')).toHaveStyle({ width: '0%' });
  });
});
