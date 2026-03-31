/// <reference types="vite/client" />
export interface Job {
    job_id: string;
    status: 'queued' | 'planning' | 'running' | 'complete' | 'failed';
    progress: number;
    frames_done: number;
    frames_total: number;
    current_step: string;
    elapsed_s: number;
    message: string;
    pipeline_log?: any;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const pipelineApi = {
    async createJob(startFrame: File, endFrame: File): Promise<{ job_id: string; status: string }> {
        const formData = new FormData();
        formData.append('start_frame', startFrame);
        formData.append('end_frame', endFrame);
        // Added standard configuration based on new python parameters
        formData.append('n_frames', '200');
        formData.append('width', '1024');
        formData.append('height', '1024');
        formData.append('fps', '24');

        const res = await fetch(`${API_URL}/api/jobs`, {
            method: 'POST',
            body: formData,
        });
        if (!res.ok) throw new Error('Upload failed');
        return res.json();
    },

    async getJobStatus(jobId: string): Promise<Job> {
        const res = await fetch(`${API_URL}/api/jobs/${jobId}`);
        if (!res.ok) throw new Error('Failed to fetch job status');
        return res.json();
    },

    getVideoUrl(jobId: string): string {
        return `${API_URL}/api/jobs/${jobId}/video`;
    },

    getZipUrl(jobId: string): string {
        return `${API_URL}/api/jobs/${jobId}/frames.zip`;
    },

    async deleteJob(jobId: string): Promise<void> {
        const res = await fetch(`${API_URL}/api/jobs/${jobId}`, {
            method: 'DELETE',
        });
        if (!res.ok) throw new Error('Delete failed');
    }
};
