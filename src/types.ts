export type ApplicationStatus = 'Draft' | 'Published' | 'Screening' | 'Closed' | 'Completed'

export type Application = {
  id: string
  name: string
  description: string
  status: ApplicationStatus
  deadline: string
  target: number
  submitted: number
  eligible: number
  shortlisted: number
  selected: number
}

export type NavItem = {
  label: string
  icon: string
}