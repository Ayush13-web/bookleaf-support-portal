export const ROLES = Object.freeze({ AUTHOR: 'author', ADMIN: 'admin' });

export const TICKET_STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];
export const CLOSED_STATUSES = ['Resolved', 'Closed'];

export const CATEGORIES = [
  'Royalty & Payments',
  'ISBN & Metadata Issues',
  'Printing & Quality',
  'Distribution & Availability',
  'Book Status & Production Updates',
  'General Inquiry',
];

export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
export const PRIORITY_RANK = { Critical: 4, High: 3, Medium: 2, Low: 1 };

export const DEFAULT_CATEGORY = 'General Inquiry';
export const DEFAULT_PRIORITY = 'Medium';
