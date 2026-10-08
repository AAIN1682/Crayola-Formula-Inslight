import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/States';
import { Button, ButtonLink } from '../components/ui/Button';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-xl py-10">
      <Card>
        <EmptyState
          variant="search"
          title="That page is not available"
          message="The address you opened does not match a formula, submission, alert or raw material in this workspace."
          action={
            <div className="flex items-center gap-2">
              <Button onClick={() => navigate(-1)}>Go back</Button>
              <ButtonLink to="/" variant="primary">
                Open Overview
              </ButtonLink>
            </div>
          }
        />
      </Card>
    </div>
  );
}
