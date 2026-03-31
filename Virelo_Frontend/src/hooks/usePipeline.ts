import { useState, useEffect, useRef } from 'react';
import { pipelineApi, Job } from '../api/pipelineApi';

export function usePipeline() {
    const [jobId, setJobId] = useState<string | null>(null);
    const [job, setJob] = useState<Job | null>(null);
    const [error, setError] = useState<string | null>(null);
    const timeoutRef = useRef<number>();

    const uploadVideo = async (startFrame: File, endFrame: File) => {
        try {
            setError(null);
            setJob({ 
                status: 'queued', 
                progress: 0, 
                frames_done: 0, 
                frames_total: 200, 
                current_step: 'Uploading...',
                elapsed_s: 0,
                message: '',
                job_id: '' 
            });
            const result = await pipelineApi.createJob(startFrame, endFrame);
            setJobId(result.job_id);
        } catch (err: any) {
            setError(err.message || 'Upload failed');
            setJob(null);
        }
    };

    useEffect(() => {
        if (!jobId) return;

        const poll = async () => {
            try {
                const currentJob = await pipelineApi.getJobStatus(jobId);
                setJob(currentJob);

                if (['queued', 'planning', 'running'].includes(currentJob.status)) {
                    timeoutRef.current = window.setTimeout(poll, 1500);
                }
            } catch (err: any) {
                setError(err.message || 'Polling failed');
            }
        };

        poll();

        return () => {
             if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [jobId]);

    const deleteJob = async () => {
        if (jobId) {
            await pipelineApi.deleteJob(jobId);
            setJobId(null);
            setJob(null);
        }
    };

    return { job, jobId, error, uploadVideo, deleteJob };
}
