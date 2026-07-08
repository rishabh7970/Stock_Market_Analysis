import React from 'react';

interface SkeletonProps {
    className?: string;
}

/** Shimmer placeholder — swap in wherever a section is loading, instead of plain "Loading..." text. */
const Skeleton: React.FC<SkeletonProps> = ({ className = 'h-4 w-full' }) => (
    <div className={`skeleton rounded ${className}`} />
);

export default Skeleton;