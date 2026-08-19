import { Button } from '@dataroom/ui';

export function App() {
  return (
    <div>
      {/* Smoke test: confirms the Tailwind preset + shadcn/ui setup in libs/ui resolves
          and renders correctly from apps/web. */}
      <Button>Hello Data Room</Button>
    </div>
  );
}

export default App;
