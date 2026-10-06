import type { ExposureInputRecord } from '../../types/domain';
import { Badge } from '../ui/Badge';
import { TBody, Table, TableScroll, Td, Th, THead, Tr } from '../ui/Table';
import { Notice } from '../ui/DemoNotice';
import { FIXTURE_SOURCE } from '../../utils/screening';

export function ExposureReadiness({ inputs }: { inputs: ExposureInputRecord[] }) {
  const notAssessed = inputs.filter((input) => !input.available);
  const fixtureCount = inputs.filter((input) => input.source.startsWith(FIXTURE_SOURCE)).length;

  return (
    <div className="space-y-3">
      <TableScroll minWidth="min-w-[620px]">
        <Table caption="Exposure assessment readiness">
          <THead>
            <tr>
              <Th>Required input</Th>
              <Th>Unit</Th>
              <Th>Value</Th>
              <Th>Availability</Th>
              <Th>Source</Th>
            </tr>
          </THead>
          <TBody>
            {inputs.map((input) => (
              <Tr key={input.key}>
                <Td className="font-medium">{input.label}</Td>
                <Td className="whitespace-nowrap text-muted">{input.unit}</Td>
                <Td className="tabular">
                  {input.available ? (
                    (input.value ?? '—')
                  ) : (
                    <span className="text-warning">Not assessed</span>
                  )}
                </Td>
                <Td>
                  <Badge tone={input.available ? 'success' : 'warning'}>
                    {input.available ? 'Available' : 'Not assessed'}
                  </Badge>
                </Td>
                <Td className="max-w-[320px] text-[13px] text-muted">{input.source}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </TableScroll>

      <Notice tone="neutral" title="How to read this panel">
        {fixtureCount > 0 ? (
          <>
            {fixtureCount} of these inputs are prepopulated from an illustrative demo fixture based on the
            product category. They are placeholders for a demonstration, not validated safety calculations and
            not the result of any exposure model.{' '}
          </>
        ) : null}
        {notAssessed.length > 0
          ? `${notAssessed.length} input${notAssessed.length === 1 ? ' is' : 's are'} marked Not assessed because the underlying record is missing.`
          : 'Every input the demo checks look for is present.'}
      </Notice>
    </div>
  );
}
