import React, { useRef } from 'react';
import { pipelineApi } from '../../api/pipelineApi';

interface VideoPlayerProps {
    jobId: string;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ jobId }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const videoUrl = pipelineApi.getVideoUrl(jobId);
    const zipUrl = pipelineApi.getZipUrl(jobId);

    const handleDownloadZip = () => {
        window.open(zipUrl, '_blank');
    };

    return (
        <div className="bg-gray-900 border border-emerald-900 rounded-lg overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-black/40">
                <h3 className="text-lg font-medium text-amber-500 tracking-wide">Output View</h3>
                <button 
                    onClick={handleDownloadZip}
                    className="flex items-center space-x-2 bg-emerald-700 hover:bg-emerald-600 border border-emerald-500/50 text-white px-4 py-2 rounded transition-all shadow-lg hover:shadow-emerald-900"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span className="font-semibold text-sm tracking-wider">ZIP DOWNLOAD</span>
                </button>
            </div>
            
            <div className="aspect-video bg-black relative flex items-center justify-center p-2">
                <video 
                    ref={videoRef}
                    src={videoUrl}
                    controls
                    playsInline
                    crossOrigin="anonymous"
                    className="w-full h-full object-contain rounded border border-gray-800"
                >
                    Your browser does not support the video tag.
                </video>
            </div>
        </div>
    );
};
