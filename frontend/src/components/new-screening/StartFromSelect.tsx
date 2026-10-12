import { useEffect, useState } from 'react';
import { fetchAllFormulas } from '../../api/formulaBackend';
import type { Formula } from '../../types/domain';
import { defaultDraft, emptyCompositionRow, type NewScreeningDraft } from '../../types/newScreening';
import { formulaToDraft } from '../../utils/newScreeningSave';

export function StartFromSelect({
  current,
  dirty,
  onApply,
}: {
  current: NewScreeningDraft;
  dirty: boolean;
  onApply: (draft: NewScreeningDraft) => void;
}) {
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [value, setValue] = useState('');

  useEffect(() => {
    void fetchAllFormulas({ lifecycle: ['draft', 'active', 'archived'] }).then(({ formulas: rows }) => setFormulas(rows));
  }, []);

  const apply = (nextValue: string) => {
    setValue(nextValue);
    if (!nextValue || nextValue === '__current__') return;
    if (nextValue === '__blank__') {
      if (dirty && !window.confirm('Replace the current draft with a blank formula?')) {
        setValue('');
        return;
      }
      onApply(defaultDraft());
      return;
    }
    if (dirty && !window.confirm('Replace what you have typed with a copy of the selected formula?')) {
      setValue('');
      return;
    }
    const formula = formulas.find((item) => item.id === nextValue);
    if (!formula) return;
    const copied = formulaToDraft(formula);
    copied.formulaId = undefined;
    copied.ingredients = copied.ingredients.length ? copied.ingredients : [emptyCompositionRow()];
    onApply(copied);
  };

  return (
    <div className="ps-startfrom">
      <label className="ps-flabel" htmlFor="ps-start-from">
        Start from
      </label>
      <select
        id="ps-start-from"
        className="ps-in"
        value={value || '__current__'}
        onChange={(event) => apply(event.target.value)}
      >
        <option value="__current__">{current.formulaId ? 'Current draft' : 'Blank formula'}</option>
        <option value="__blank__">Blank formula</option>
        {formulas.map((formula) => (
          <option key={formula.id} value={formula.id}>
            {(formula.formulaCode || formula.id) + ' · ' + formula.name}
          </option>
        ))}
      </select>
    </div>
  );
}
