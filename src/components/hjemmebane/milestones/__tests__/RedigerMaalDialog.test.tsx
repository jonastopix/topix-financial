/**
 * RedigerMaalDialog — «Redigér» på et målkort (fladen 1/10-2026; rådets fund 2,
 * 4, 5 og 13 samme aften).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ScoreMaaned } from "@/lib/boardroomScore";
import { maalKort, type MaalMedTal } from "@/lib/hjemmebane/maalTal";
import { TAL_KUN_TALLET } from "@/lib/hjemmebane/dineMaalFlade";
import { FRIST_FOER_I_DAG, RedigerMaalDialog, REDIGER_TALLET_NU } from "../RedigerMaalDialog";

const NU = new Date("2026-10-01T10:00:00Z");
const m = (key: string, metrics: Record<string, number | null>): ScoreMaaned => ({ key, basis: "measured", foersteGodkendtAt: null, metrics });
const TRE = [m("2026-07", { revenue: 100_000 }), m("2026-08", { revenue: 120_000 }), m("2026-09", { revenue: 140_000 })];

const maal = (over: Partial<MaalMedTal> = {}): MaalMedTal => ({
  id: "m1",
  title: "100 kunder",
  status: "active",
  deadline: "2027-04-01",
  created_at: "2026-04-01T08:00:00Z",
  target_value: 100,
  current_value: 40,
  unit: "kunder",
  art: "tal",
  maal_noegle: "andet_tal",
  udgangspunkt: 10,
  udgangspunkt_dato: "2026-04-01",
  ...over,
});

type Props = React.ComponentProps<typeof RedigerMaalDialog>;
const vis = (raa: MaalMedTal, over: Partial<Props> = {}) => {
  const kort = maalKort(raa, [], TRE, NU);
  const onGem = vi.fn<Props["onGem"]>(async () => null);
  const onClose = vi.fn();
  const props: Props = {
    kort,
    open: true,
    onClose,
    doemFrist: () => null,
    tastetTal: raa.maal_noegle === "andet_tal" ? raa.current_value : null,
    enhed: raa.unit,
    onGem,
    nu: NU,
    ...over,
  };
  const r = render(<RedigerMaalDialog {...props} />);
  return { ...r, onGem, onClose, props };
};

afterEach(cleanup);

describe("RedigerMaalDialog", () => {
  it("startværdier: titel, frist og det tastede tal; Gem sender kun det ændrede", async () => {
    const { onGem, onClose } = vis(maal());
    expect((screen.getByLabelText("Målet som én sætning") as HTMLInputElement).value).toBe("100 kunder");
    expect((screen.getByLabelText("Frist") as HTMLInputElement).value).toBe("2027-04-01");
    expect((screen.getByLabelText(REDIGER_TALLET_NU) as HTMLInputElement).value).toBe("40");
    fireEvent.change(screen.getByLabelText(REDIGER_TALLET_NU), { target: { value: "1.500" } }); // fund 4: dansk tusindtal
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));
    await waitFor(() => expect(onGem).toHaveBeenCalledWith({ current_value: 1500 }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("fund 2: et nyt kort-objekt (samme id) nulstiller IKKE indtastningen; et andet mål gør", () => {
    const { rerender, props } = vis(maal());
    fireEvent.change(screen.getByLabelText("Målet som én sætning"), { target: { value: "120 kunder" } });
    // Hooket tikker: nyt objekt, samme id
    rerender(<RedigerMaalDialog {...props} kort={maalKort(maal(), [], TRE, new Date("2026-10-01T10:01:00Z"))} />);
    expect((screen.getByLabelText("Målet som én sætning") as HTMLInputElement).value).toBe("120 kunder");
    rerender(<RedigerMaalDialog {...props} kort={maalKort(maal({ id: "m2", title: "Et andet mål" }), [], TRE, NU)} />);
    expect((screen.getByLabelText("Målet som én sætning") as HTMLInputElement).value).toBe("Et andet mål");
  });

  it("fund 5: for et mål med art kan fristen hverken tømmes, ligge i fortiden eller mere end 36 mdr. frem", async () => {
    const { onGem } = vis(maal());
    const frist = screen.getByLabelText("Frist") as HTMLInputElement;
    expect(frist.required).toBe(true);
    fireEvent.change(frist, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));
    await screen.findByText("Vælg en frist");
    fireEvent.change(frist, { target: { value: "2026-09-30" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));
    await screen.findByText("Fristen skal ligge efter i dag");
    fireEvent.change(frist, { target: { value: "2029-10-02" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));
    await screen.findByText(/højst ligge 36 måneder frem/);
    expect(onGem).not.toHaveBeenCalled();
  });

  it("fund 5: et gammelt mål (art null) må stadig stå uden frist", async () => {
    const { onGem } = vis(maal({ art: null, maal_noegle: null, udgangspunkt: null, deadline: "2027-04-01" }));
    const frist = screen.getByLabelText("Frist") as HTMLInputElement;
    expect(frist.required).toBe(false);
    fireEvent.change(frist, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));
    await waitFor(() => expect(onGem).toHaveBeenCalledWith({ deadline: null }));
  });

  it("fristen dømmes mod målets åbne skridt (kalderens doemFrist) — grunden i feltet, intet gemt", async () => {
    const { onGem } = vis(maal(), { doemFrist: () => "Fristen ligger før skridtet «Ring» (20. okt. 2026)" });
    fireEvent.change(screen.getByLabelText("Frist"), { target: { value: "2026-10-15" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));
    await screen.findByText("Fristen ligger før skridtet «Ring» (20. okt. 2026)");
    expect(onGem).not.toHaveBeenCalled();
  });

  it("fund 13: et nej fra skrivningen holder dialogen åben med grunden", async () => {
    const onGemNej = vi.fn<Props["onGem"]>(async () => "Målet blev ikke gemt — genindlæs siden.");
    const { onClose } = vis(maal(), { onGem: onGemNej });
    const onGem = onGemNej;
    fireEvent.change(screen.getByLabelText("Målet som én sætning"), { target: { value: "120 kunder" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));
    await screen.findByText("Målet blev ikke gemt — genindlæs siden.");
    expect(onGem).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector("[data-rediger-maal]")).not.toBeNull();
  });

  it("intet ændret → lukker uden at gemme", () => {
    const { onGem, onClose } = vis(maal());
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));
    expect(onGem).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("runde 2, fund 1: et decimaltal forudfyldes dansk («2,125»), og et UBERØRT felt gemmes aldrig — kun titlen sendes", async () => {
    const { onGem } = vis(maal({ current_value: 2.125 }));
    expect((screen.getByLabelText(REDIGER_TALLET_NU) as HTMLInputElement).value).toBe("2,125");
    fireEvent.change(screen.getByLabelText("Målet som én sætning"), { target: { value: "120 kunder" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));
    await waitFor(() => expect(onGem).toHaveBeenCalledWith({ title: "120 kunder" }));
    expect(onGem.mock.calls[0][0]).not.toHaveProperty("current_value");
  });

  it("runde 2, fund 1: et felt, der rettes tilbage til startteksten, gemmes ikke", () => {
    const { onGem, onClose } = vis(maal());
    const tal = screen.getByLabelText(REDIGER_TALLET_NU);
    fireEvent.change(tal, { target: { value: "41" } });
    fireEvent.change(tal, { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));
    expect(onGem).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("runde 2, fund 4: kaster skriveren, låses «Gemmer…» ikke — knappen er fri igen og grunden står", async () => {
    const onGemKaster = vi.fn<Props["onGem"]>(async () => { throw new Error("Netværket faldt ud"); });
    const { onClose } = vis(maal(), { onGem: onGemKaster });
    fireEvent.change(screen.getByLabelText("Målet som én sætning"), { target: { value: "120 kunder" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));
    await screen.findByText("Netværket faldt ud");
    expect((screen.getByRole("button", { name: "Gem" }) as HTMLButtonElement).disabled).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("runde 2, fund 6: «100 kunder» i talfeltet får sin egen grund; «1.500 kr.» læses som 1500", async () => {
    const { onGem } = vis(maal());
    fireEvent.change(screen.getByLabelText(REDIGER_TALLET_NU), { target: { value: "100 kunder" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));
    await screen.findByText(TAL_KUN_TALLET);
    expect(onGem).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(REDIGER_TALLET_NU), { target: { value: "1.500 kr." } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));
    await waitFor(() => expect(onGem).toHaveBeenCalledWith({ current_value: 1500 }));
  });

  it("runde 2, fund 8: et gammelt mål (art null) afviser en TASTET frist før i dag — en uændret gammel frist blokerer ikke titlen", async () => {
    const gammelt = maal({ art: null, maal_noegle: null, udgangspunkt: null, deadline: "2026-09-01" });
    const { onGem } = vis(gammelt);
    fireEvent.change(screen.getByLabelText("Frist"), { target: { value: "2026-09-15" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));
    await screen.findByText(FRIST_FOER_I_DAG);
    expect(onGem).not.toHaveBeenCalled();
    cleanup();
    const anden = vis(gammelt);
    fireEvent.change(screen.getByLabelText("Målet som én sætning"), { target: { value: "Nyt navn" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));
    await waitFor(() => expect(anden.onGem).toHaveBeenCalledWith({ title: "Nyt navn" }));
  });
});
