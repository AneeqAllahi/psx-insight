import { Suspense } from 'react';
import { StockPage } from './stock-page';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <StockPage />
    </Suspense>
  );
}
