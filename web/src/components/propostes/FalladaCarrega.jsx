export default function FalladaCarrega({ onTornarAProvar, onSortir }) {
  return (
    <div className="propostes-public__fallada">
      <p className="form__error">No s&apos;han pogut carregar les propostes. Torna-ho a provar.</p>
      <div className="propostes-public__fallada-accions">
        <button type="button" className="btn" onClick={onTornarAProvar}>Tornar a provar</button>
        {onSortir && (
          <button type="button" className="votacio__enllac" onClick={onSortir}>Sortir</button>
        )}
      </div>
    </div>
  );
}
