import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Spinner from '@/shared/components/Spinner';

describe('Spinner', () => {
  it('renders with default size', () => {
    render(<Spinner />);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('applies size classes correctly', () => {
    const { container } = render(<Spinner size="lg" />);
    const svg = container.querySelector('svg');

    expect(svg).not.toBeNull();
    expect(svg).toHaveClass('h-8', 'w-8');
  });

  it('has accessible label', () => {
    render(<Spinner />);
    expect(screen.getByLabelText('Chargement…')).toBeTruthy();
  });
});