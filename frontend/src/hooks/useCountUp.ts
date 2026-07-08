import { useEffect, useRef, useState } from 'react';

/**
 * Animates a number smoothly toward its target whenever it changes —
 * used for price displays so ticks/refreshes feel alive instead of
 * snapping instantly. Pure requestAnimationFrame, no animation library.
 */
export function useCountUp(target: number | undefined, duration = 400): number | undefined {
    const [value, setValue] = useState<number | undefined>(target);
    const fromRef = useRef<number | undefined>(target);
    const rafRef = useRef<number | undefined>(undefined);

    useEffect(() => {
        if (target === undefined) {
            Promise.resolve().then(() => setValue(undefined));
            return;
        }

        const from = fromRef.current ?? target;
        const start = performance.now();

        const step = (now: number) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
            setValue(from + (target - from) * eased);

            if (progress < 1) {
                rafRef.current = requestAnimationFrame(step);
            } else {
                fromRef.current = target;
            }
        };

        rafRef.current = requestAnimationFrame(step);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target, duration]);

    return value;
}

export default useCountUp;