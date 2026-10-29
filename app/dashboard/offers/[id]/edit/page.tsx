// Edycja oferty korzysta z tego samego kreatora co tworzenie nowej
import { redirect } from 'next/navigation';

export default function EditOfferRedirect({ params }: { params: { id: string } }) {
  redirect(`/dashboard/offers/new?edit=${encodeURIComponent(params.id)}`);
}
