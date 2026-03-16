/**
 * @fileoverview Component to display active broadcast messages.
 */

import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { broadcastMessageService } from '../api/broadcastApi';
import { BroadcastMessage } from '../types/broadcast.types';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth';
import { queryKeys } from '@/lib/queryKeys';

/**
 * @description Props for the BroadcastBanner component.
 */
interface BroadcastBannerProps {
    /** Additional CSS classes for the container */
    className?: string;
    /** Whether to render as an inline block (with margin/rounding) or full width */
    inline?: boolean;
}

/**
 * @description Renders active broadcast messages as banner alerts.
 * Handles fetching (deduplicated via TanStack Query), displaying, and dismissing messages.
 * Uses localStorage for immediate client-side persistence of dismissed state.
 *
 * @param {BroadcastBannerProps} props - Component properties.
 * @returns {JSX.Element | null} The banner component or null if no messages.
 */
const BroadcastBanner: React.FC<BroadcastBannerProps> = ({ className = '', inline = false }) => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const [dismissedMessages, setDismissedMessages] = useState<Record<string, number>>({});

    /**
     * TanStack Query handles deduplication: even if React.StrictMode
     * double-mounts the component, only one network request is made.
     */
    const { data: messages = [] } = useQuery<BroadcastMessage[]>({
        queryKey: queryKeys.broadcast.active(),
        queryFn: () => broadcastMessageService.getActiveMessages(),
        staleTime: 5 * 60 * 1000,
    });

    /**
     * @description Effect to load dismissed state from localStorage.
     */
    useEffect(() => {
        const saved = localStorage.getItem('dismissed_broadcasts_v2');
        if (saved) {
            try {
                const data = JSON.parse(saved) as Record<string, number>;
                setDismissedMessages(data);
            } catch (e) {
                console.error('Failed to parse dismissed broadcasts', e);
            }
        }
    }, [user?.id]); // Re-load when user session changes

    /**
     * @description Dismiss a specific message.
     * Updates local state, localStorage, and attempts to sync with backend if logged in.
     *
     * @param {string} id - The ID of the message to dismiss.
     */
    const handleDismiss = async (id: string) => {
        // 1. Immediate UI update via local state
        const now = Date.now();
        const newDismissed = { ...dismissedMessages, [id]: now };
        setDismissedMessages(newDismissed);
        localStorage.setItem('dismissed_broadcasts_v2', JSON.stringify(newDismissed));

        // 2. Persistent update on backend if logged in
        if (user) {
            try {
                await broadcastMessageService.dismissMessage(id);
            } catch (err) {
                console.error('Failed to record broadcast dismissal on server', err);
            }
        }
    };

    // Filter out messages that have been dismissed locally via localStorage
    const visibleMessages = messages.filter(m => !dismissedMessages[m.id]);

    // Early return when no messages need to be displayed
    if (visibleMessages.length === 0) return null;

    return (
        <div className={`flex flex-col gap-1 ${className}`}>
            {visibleMessages.map((msg) => (
                <div
                    key={msg.id}
                    className={`relative px-4 py-2 text-center text-sm font-medium ${inline ? 'rounded-lg mb-4' : ''}`}
                    style={{
                        backgroundColor: msg.color,
                        color: msg.font_color,
                    }}
                >
                    <div className="relative flex items-center justify-center min-w-0 px-20">
                        <span className="text-center break-all whitespace-normal leading-relaxed">
                            {msg.message}
                        </span>
                        {/* Only show dismiss button when the message allows user dismissal */}
                        {msg.is_dismissible && (
                            <button
                                onClick={() => handleDismiss(msg.id)}
                                className="absolute right-2 px-2 py-1 hover:bg-black/20 bg-black/5 rounded-md transition-all flex items-center gap-1.5"
                                title={t('common.hide')}
                            >
                                <span className="text-[10px] font-bold uppercase tracking-wider">{t('common.hide')}</span>
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default BroadcastBanner;
