/**
 * @fileoverview Unit tests for the LandingPage component.
 * Verifies that all page sections are rendered in the correct order.
 */

import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

// Mock all section components to verify composition
vi.mock('../../../src/features/landing/components/LandingNav', () => ({
  LandingNav: () => <div data-testid="landing-nav">LandingNav</div>,
}))
vi.mock('../../../src/features/landing/components/HeroSection', () => ({
  HeroSection: () => <div data-testid="hero-section">HeroSection</div>,
}))
vi.mock('../../../src/features/landing/components/FeaturesSection', () => ({
  FeaturesSection: () => <div data-testid="features-section">FeaturesSection</div>,
}))
vi.mock('../../../src/features/landing/components/UseCasesSection', () => ({
  UseCasesSection: () => <div data-testid="use-cases-section">UseCasesSection</div>,
}))
vi.mock('../../../src/features/landing/components/SDLCSection', () => ({
  SDLCSection: () => <div data-testid="sdlc-section">SDLCSection</div>,
}))
vi.mock('../../../src/features/landing/components/DeploymentSection', () => ({
  DeploymentSection: () => <div data-testid="deployment-section">DeploymentSection</div>,
}))
vi.mock('../../../src/features/landing/components/CTASection', () => ({
  CTASection: () => <div data-testid="cta-section">CTASection</div>,
}))
vi.mock('../../../src/features/landing/components/FooterSection', () => ({
  FooterSection: () => <div data-testid="footer-section">FooterSection</div>,
}))

import LandingPage from '../../../src/features/landing/pages/LandingPage'

describe('LandingPage', () => {
  it('renders all page sections', () => {
    const { getByTestId } = render(<LandingPage />)

    expect(getByTestId('landing-nav')).toBeInTheDocument()
    expect(getByTestId('hero-section')).toBeInTheDocument()
    expect(getByTestId('features-section')).toBeInTheDocument()
    expect(getByTestId('use-cases-section')).toBeInTheDocument()
    expect(getByTestId('sdlc-section')).toBeInTheDocument()
    expect(getByTestId('deployment-section')).toBeInTheDocument()
    expect(getByTestId('cta-section')).toBeInTheDocument()
    expect(getByTestId('footer-section')).toBeInTheDocument()
  })

  it('renders sections in correct order', () => {
    const { container } = render(<LandingPage />)
    const main = container.querySelector('main')

    // Main should contain the ordered content sections (not nav/footer)
    const mainChildren = Array.from(main!.children)
    expect(mainChildren).toHaveLength(6)
    expect(mainChildren[0]).toHaveAttribute('data-testid', 'hero-section')
    expect(mainChildren[1]).toHaveAttribute('data-testid', 'features-section')
    expect(mainChildren[2]).toHaveAttribute('data-testid', 'use-cases-section')
    expect(mainChildren[3]).toHaveAttribute('data-testid', 'sdlc-section')
    expect(mainChildren[4]).toHaveAttribute('data-testid', 'deployment-section')
    expect(mainChildren[5]).toHaveAttribute('data-testid', 'cta-section')
  })

  it('renders nav before main and footer after', () => {
    const { container } = render(<LandingPage />)
    const root = container.firstElementChild!
    const children = Array.from(root.children)

    // Nav → Main → Footer
    expect(children[0]).toHaveAttribute('data-testid', 'landing-nav')
    expect(children[1].tagName.toLowerCase()).toBe('main')
    expect(children[2]).toHaveAttribute('data-testid', 'footer-section')
  })
})
