/**
 * @fileoverview Tests for the shared FeedbackCommentPopover component.
 * Validates thumb up/down behavior, popover display, comment submission,
 * and disabled state handling.
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

// Mock i18n to return key as-is
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en' },
  }),
}))

// Mock Radix popover to simplify DOM testing
vi.mock('@radix-ui/react-popover', () => {
  const Root = ({ open, onOpenChange, children }: any) => (
    <div data-testid="popover-root" data-open={open}>
      {React.Children.map(children, (child: any) =>
        React.isValidElement(child)
          ? React.cloneElement(child as React.ReactElement<any>, { 'data-popover-open': open, onOpenChange })
          : child
      )}
    </div>
  )
  const Trigger = React.forwardRef(({ children, asChild, ...props }: any, _ref: any) => {
    // When asChild, render children directly
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children as React.ReactElement<any>, props)
    }
    return <button {...props}>{children}</button>
  })
  Trigger.displayName = 'PopoverTrigger'
  const Portal = ({ children }: any) => <>{children}</>
  const Content = React.forwardRef(({ children, className, ...props }: any, _ref: any) => {
    // Only render content when popover is open (check parent context)
    const open = props['data-popover-open']
    if (open === false) return null
    return <div data-testid="popover-content" className={className}>{children}</div>
  })
  Content.displayName = 'PopoverContent'
  return { Root, Trigger, Portal, Content }
})

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ThumbsUp: (props: any) => <span data-testid="thumbs-up-icon" {...props} />,
  ThumbsDown: (props: any) => <span data-testid="thumbs-down-icon" {...props} />,
}))

import { FeedbackCommentPopover } from '../../src/components/FeedbackCommentPopover'

describe('FeedbackCommentPopover', () => {
  it('renders two thumb buttons', () => {
    const onFeedback = vi.fn()
    render(<FeedbackCommentPopover feedback={null} onFeedback={onFeedback} />)

    // Both thumb buttons should be visible
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThanOrEqual(2)
    expect(screen.getByTestId('thumbs-up-icon')).toBeInTheDocument()
    expect(screen.getByTestId('thumbs-down-icon')).toBeInTheDocument()
  })

  it('clicking thumb-up calls onFeedback(true) without popover', async () => {
    const onFeedback = vi.fn()
    render(<FeedbackCommentPopover feedback={null} onFeedback={onFeedback} />)

    // Click the thumb-up button (first button)
    const thumbUpBtn = screen.getByLabelText('Helpful')
    await userEvent.click(thumbUpBtn)

    // Should call onFeedback with true (thumbup)
    expect(onFeedback).toHaveBeenCalledWith(true)

    // Popover content should NOT appear
    expect(screen.queryByTestId('popover-content')).not.toBeInTheDocument()
  })

  it('clicking thumb-down opens popover with textarea', async () => {
    const onFeedback = vi.fn()
    render(<FeedbackCommentPopover feedback={null} onFeedback={onFeedback} />)

    // Click the thumb-down button
    const thumbDownBtn = screen.getByLabelText('Not helpful')
    await userEvent.click(thumbDownBtn)

    // Popover content should appear with textarea
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Tell us what could be better...')).toBeInTheDocument()
    })
  })

  it('"Send feedback" is disabled when textarea is empty', async () => {
    const onFeedback = vi.fn()
    render(<FeedbackCommentPopover feedback={null} onFeedback={onFeedback} />)

    // Open the popover
    const thumbDownBtn = screen.getByLabelText('Not helpful')
    await userEvent.click(thumbDownBtn)

    // "Send feedback" button should be disabled when textarea is empty
    await waitFor(() => {
      const sendBtn = screen.getByText('Send feedback')
      expect(sendBtn).toBeDisabled()
    })
  })

  it('"Skip for now" calls onFeedback(false) without comment', async () => {
    const onFeedback = vi.fn()
    render(<FeedbackCommentPopover feedback={null} onFeedback={onFeedback} />)

    // Open the popover
    const thumbDownBtn = screen.getByLabelText('Not helpful')
    await userEvent.click(thumbDownBtn)

    // Click skip
    await waitFor(async () => {
      const skipBtn = screen.getByText('Skip for now')
      await userEvent.click(skipBtn)
    })

    // Should call with false (thumbdown) and no comment
    expect(onFeedback).toHaveBeenCalledWith(false)
  })

  it('disabled prop disables both buttons', () => {
    const onFeedback = vi.fn()
    render(<FeedbackCommentPopover feedback={null} onFeedback={onFeedback} disabled />)

    const thumbUpBtn = screen.getByLabelText('Helpful')
    const thumbDownBtn = screen.getByLabelText('Not helpful')

    expect(thumbUpBtn).toBeDisabled()
    expect(thumbDownBtn).toBeDisabled()
  })

  it('shows green color when feedback is up', () => {
    const onFeedback = vi.fn()
    render(<FeedbackCommentPopover feedback="up" onFeedback={onFeedback} />)

    const thumbUpBtn = screen.getByLabelText('Helpful')
    expect(thumbUpBtn.className).toContain('text-green-500')
    expect(thumbUpBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows red color when feedback is down', () => {
    const onFeedback = vi.fn()
    render(<FeedbackCommentPopover feedback="down" onFeedback={onFeedback} />)

    const thumbDownBtn = screen.getByLabelText('Not helpful')
    expect(thumbDownBtn.className).toContain('text-red-500')
    expect(thumbDownBtn).toHaveAttribute('aria-pressed', 'true')
  })
})
