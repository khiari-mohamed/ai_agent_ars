import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Badge from '@/shared/components/Badge';

describe('Badge', () => {
  it('renders children with custom classes and a dot when requested', () => {
    render(
      <Badge className="bg-blue-50 text-blue-700 border-blue-200" dot>
        Active
      </Badge>
    );

    const badge = screen.getByText('Active');
    expect(badge).toHaveClass('inline-flex', 'items-center', 'gap-2');
    expect(badge).toHaveClass('bg-blue-50', 'text-blue-700', 'border-blue-200');
    expect(badge.querySelector('span')).toHaveClass('h-2', 'w-2');
  });
});
