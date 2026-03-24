export type Role = 'STUDENT' | 'RECRUITER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  username?: string;
  role: Role;
  name?: string;
  profile_picture_url?: string;
}

export interface FriendRequest {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  created_at: string;
  sender_name?: string;
  sender_username?: string;
  sender_avatar?: string;
}

export interface Friendship {
  id: string;
  user_id1: string;
  user_id2: string;
  friend_id: string;
  created_at: string;
  friend_name?: string;
  friend_username?: string;
  friend_avatar?: string;
  friend_role?: Role;
}

export interface DirectMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: number;
  created_at: string;
}

export interface StudentProfile {
  user_id: string;
  name: string;
  headline?: string;
  education: string;
  college_name?: string;
  degree?: string;
  branch?: string;
  graduation_year?: string;
  cgpa?: string;
  bio: string;
  skills: string[];
  location?: string;
  phone?: string;
  email?: string;
  profile_picture_url?: string;
  linkedin_url?: string;
  github_url?: string;
  portfolio_url?: string;
  experience_years?: number;
}

export interface RecruiterProfile {
  user_id: string;
  company_name: string;
  company_bio: string;
  is_verified: boolean;
  location?: string;
  phone?: string;
  email?: string;
  profile_picture_url?: string;
  company_website?: string;
  industry?: string;
  company_size?: string;
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
  is_applied?: boolean;
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
