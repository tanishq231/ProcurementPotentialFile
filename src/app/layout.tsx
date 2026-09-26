import type { Metadata } from 'next';
import '@frontend/styles/globals.css';
export const metadata: Metadata={title:'Parts Planner | Supply Desk',description:'A shared, role-aware parts planning workspace.'};
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
