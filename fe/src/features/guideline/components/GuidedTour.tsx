/**
 * @fileoverview Guided tour overlay component using react-joyride.
 * Renders step-by-step interactive tooltips for feature onboarding.
 * @module features/guideline/components/GuidedTour
 */
import Joyride, { CallBackProps, Step, STATUS, EVENTS } from 'react-joyride';
import { useTranslation } from 'react-i18next';
import { IJoyrideStep } from '../data/types';
import { LanguageCode } from '@/i18n';

/**
 * @description Props for the GuidedTour component.
 */
interface GuidedTourProps {
    /** Step definitions with localized content */
    steps: IJoyrideStep[];
    /** Whether the tour is currently running */
    run: boolean;
    /** Callback fired when the tour finishes or is skipped */
    onTourFinish: () => void;
}

/**
 * @description Renders a react-joyride guided tour with localized step content and button labels.
 * @param {GuidedTourProps} props - Tour steps, run state, and completion callback.
 * @returns {JSX.Element} The Joyride tour overlay.
 */
export function GuidedTour({ steps, run, onTourFinish }: GuidedTourProps) {
    const { t, i18n } = useTranslation();
    const currentLang = (i18n.language || 'en') as LanguageCode & string;

    /**
     * @description Handle joyride callback events — finish tour when completed or skipped.
     * @param {CallBackProps} data - Joyride callback data with status and event type.
     */
    const handleCallback = (data: CallBackProps) => {
        const { status, type } = data;

        // End the tour when user finishes all steps, skips, or the tour ends
        if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status as any) || type === EVENTS.TOUR_END) {
            onTourFinish();
        }
    };

    // Map localized step definitions to Joyride's Step format
    const joyrideSteps: Step[] = steps.map(step => ({
        target: step.target,
        content: step.content[currentLang] || step.content['en'],
        placement: step.placement || 'bottom',
        disableBeacon: true,
        disableOverlayClose: true,
        spotlightPadding: 5,
    }));

    const JoyrideWrapper = Joyride as any;

    return (
        <JoyrideWrapper
            steps={joyrideSteps}
            run={run}
            continuous
            showProgress
            showSkipButton
            callback={handleCallback}
            locale={{
                back: t('guideline.tour.back', 'Back'),
                close: t('guideline.tour.skip', 'Close'),
                last: t('guideline.tour.last', 'Finish'),
                next: t('guideline.tour.next', 'Next'),
                skip: t('guideline.tour.skip', 'Skip'),
            }}
            styles={{
                options: {
                    primaryColor: '#2563eb', // blue-600
                    zIndex: 10000,
                },
                tooltipContainer: {
                    textAlign: 'left'
                },
                buttonNext: {
                    backgroundColor: '#2563eb',
                },
                buttonBack: {
                    color: '#64748b', // slate-500
                }
            }}
        />
    );
}
