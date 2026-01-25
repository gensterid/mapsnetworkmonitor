
import { useRef } from 'react';

function isDeepEqual(a, b) {
    if (a === b) return true;

    if (a && b && typeof a === 'object' && typeof b === 'object') {
        if (a.constructor !== b.constructor) return false;

        if (Array.isArray(a)) {
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) {
                if (!isDeepEqual(a[i], b[i])) return false;
            }
            return true;
        }

        const keys = Object.keys(a);
        if (keys.length !== Object.keys(b).length) return false;

        for (const key of keys) {
            if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
            if (!isDeepEqual(a[key], b[key])) return false;
        }

        return true;
    }

    return false;
}

function useDeepCompareMemoize(value) {
    const ref = useRef();
    if (!isDeepEqual(value, ref.current)) {
        ref.current = value;
    }
    return ref.current;
}

export default useDeepCompareMemoize;
