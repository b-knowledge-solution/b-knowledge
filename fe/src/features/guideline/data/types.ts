/**
 * @fileoverview Type definitions for the guideline feature.
 * Defines the structure of feature guidelines, tabs, steps, and joyride tour steps.
 * @module features/guideline/data/types
 */

/**
 * @description A single step within a guideline tab, with localized title, description, and optional details.
 */
export interface IGuidelineStep {
    /** Unique step identifier */
    id: string;
    /** Localized step title */
    title: Record<'en' | 'vi' | 'ja', string>;
    /** Localized step description */
    description: Record<'en' | 'vi' | 'ja', string>;
    /** Optional localized detail items (rendered as markdown list) */
    details?: Record<'en' | 'vi' | 'ja', string[]>;
}

/**
 * @description A tab within a feature guideline containing one or more steps.
 */
export interface IGuidelineTab {
    /** Unique tab identifier */
    tabId: string;
    /** Localized tab title */
    tabTitle: Record<'en' | 'vi' | 'ja', string>;
    /** Ordered list of steps within this tab */
    steps: IGuidelineStep[];
}

/**
 * @description A single joyride tour step definition with a CSS target selector and localized content.
 */
export interface IJoyrideStep {
    /** CSS selector for the target element */
    target: string;
    /** Localized tooltip content */
    content: Record<'en' | 'vi' | 'ja', string>;
    /** Tooltip placement relative to the target */
    placement?: 'top' | 'bottom' | 'left' | 'right';
    /** Whether to disable the beacon animation */
    disableBeacon?: boolean;
}

/**
 * @description Complete guideline configuration for a feature, including overview, tabs, and optional tour.
 */
export interface IFeatureGuideline {
    /** Feature identifier matching route metadata */
    featureId: string;
    /** Minimum role required to view this guideline */
    roleRequired: 'user' | 'leader' | 'admin';
    /** Localized overview text displayed on the overview tab */
    overview: Record<'en' | 'vi' | 'ja', string>;
    /** Optional overview image URL */
    overviewImage?: string;
    /** Guideline tabs with step-by-step instructions */
    tabs: IGuidelineTab[];
    /** Optional joyride interactive tour steps */
    tourSteps?: IJoyrideStep[];
}
