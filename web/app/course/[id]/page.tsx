import { CourseReader } from '@/components/course/CourseReader';

interface Params {
  params: Promise<{ id: string }>;
}

export default async function CourseReaderPage({ params }: Params) {
  const { id } = await params;
  return <CourseReader courseId={id} />;
}
