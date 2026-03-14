export type Role = 'STUDENT' | 'RECRUITER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  role: Role;
  name?: string;
}

export interface StudentProfile {
  user_id: string;
  name: string;
  education: string;
  bio: string;
  skills: string[];
  location?: string;
}

export interface RecruiterProfile {
  user_id: string;
  company_name: string;
  company_bio: string;
  is_verified: boolean;
  location?: string;
}

export interface Job {
  id: string;
  recruiter_id: string;
  title: string;
  description: string;
  requirements: string; // JSON string
  status: 'PENDING' | 'APPROVED' | 'FLAGGED' | 'CLOSED';
  created_at: string;
  company_name?: string;
  matchPercentage?: number;
  location?: string;
  work_type?: 'ON_SITE' | 'REMOTE' | 'HYBRID';
}

export interface Application {
  id: string;
  job_id: string;
  student_id: string;
  resume_url: string;
  answers: string; // JSON string
  status: 'PENDING' | 'SHORTLISTED' | 'REJECTED';
  created_at: string;
  title?: string;
  company_name?: string;
  student_name?: string;
  job_status?: 'PENDING' | 'APPROVED' | 'FLAGGED' | 'CLOSED';
}

export interface Message {
  id: string;
  application_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

export interface Interview {
  id: string;
  application_id: string;
  recruiter_id: string;
  student_id: string;
  scheduled_at: string;
  meeting_link: string;
  notes: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  created_at: string;
  job_title?: string;
  company_name?: string;
  student_name?: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: 'JOB_POSTED' | 'APP_STATUS' | 'INTERVIEW' | 'MESSAGE';
  title: string;
  content: string;
  link?: string;
  is_read: number;
  created_at: string;
}
