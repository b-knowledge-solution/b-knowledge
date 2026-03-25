# Landing Page Detail Design

## Overview

The Landing Page is the public marketing shell for B-Knowledge. It is a frontend-only route composed from presentational sections and does not depend on the authenticated application shell.

## Composition

| Component | Purpose |
|-----------|---------|
| `LandingNav` | Sticky top navigation |
| `HeroSection` | Product positioning and primary CTA |
| `FeaturesSection` | Product capability summary |
| `UseCasesSection` | Example business/industry use cases |
| `SDLCSection` | Delivery/process framing |
| `DeploymentSection` | Deployment options and architecture messaging |
| `CTASection` | Closing conversion call-to-action |
| `FooterSection` | Footer links and summary |

## Behavior

- Public, unauthenticated route
- Full-page composition outside the main authenticated workspace layout
- Static content sections assembled in React
- Serves as the top-level product introduction rather than an operational feature module

## Key Files

| File | Purpose |
|------|---------|
| `fe/src/features/landing/pages/LandingPage.tsx` | Top-level page composition |
| `fe/src/features/landing/components/LandingNav.tsx` | Public navigation |
| `fe/src/features/landing/components/HeroSection.tsx` | Hero block |
| `fe/src/features/landing/components/FeaturesSection.tsx` | Feature summary |
| `fe/src/features/landing/components/UseCasesSection.tsx` | Use cases |
| `fe/src/features/landing/components/SDLCSection.tsx` | SDLC/process section |
| `fe/src/features/landing/components/DeploymentSection.tsx` | Deployment section |
| `fe/src/features/landing/components/CTASection.tsx` | Call to action |
| `fe/src/features/landing/components/FooterSection.tsx` | Footer |

