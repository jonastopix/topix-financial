/**
 * HbDropzone — husets frie dropzone (13/9): kalderen får File-objektet
 * gennem onFile, både ved træk-og-slip og ved valg i det skjulte input;
 * spærret (busy/disabled) giver ingen fil videre; det skjulte input nulstilles
 * efter valg, så samme fil kan vælges igen.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HbDropzone } from "../HbDropzone";

afterEach(cleanup);

const fil = () => new File(["a,b"], "ansoegning.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

describe("HbDropzone — fri dropzone der giver filen videre", () => {
  it("viser tekst og undertekst, og har et skjult input med accept", () => {
    render(<HbDropzone onFile={() => {}} accept=".xlsx,.xls" tekst="Træk hertil" undertekst="eller klik" />);
    expect(screen.getByRole("button", { name: /Træk hertil/ })).toHaveTextContent("eller klik");
    const input = screen.getByLabelText("Træk hertil", { selector: "input" }) as HTMLInputElement;
    expect(input.type).toBe("file");
    expect(input.accept).toBe(".xlsx,.xls");
    expect(input).toHaveClass("hidden");
  });

  it("træk-og-slip kalder onFile med den første fil", () => {
    const onFile = vi.fn();
    render(<HbDropzone onFile={onFile} tekst="Træk hertil" />);
    const knap = screen.getByRole("button");
    const f = fil();
    fireEvent.drop(knap, { dataTransfer: { files: [f] } });
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(onFile).toHaveBeenCalledWith(f);
  });

  it("valg i inputtet kalder onFile og nulstiller inputtet", () => {
    const onFile = vi.fn();
    render(<HbDropzone onFile={onFile} tekst="Træk hertil" />);
    const input = screen.getByLabelText("Træk hertil", { selector: "input" }) as HTMLInputElement;
    const f = fil();
    fireEvent.change(input, { target: { files: [f] } });
    expect(onFile).toHaveBeenCalledWith(f);
    expect(input.value).toBe("");
  });

  it("klik på zonen åbner det skjulte input", () => {
    render(<HbDropzone onFile={() => {}} tekst="Træk hertil" />);
    const input = screen.getByLabelText("Træk hertil", { selector: "input" }) as HTMLInputElement;
    const klik = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button"));
    expect(klik).toHaveBeenCalledTimes(1);
  });

  it("busy viser busyTekst og giver ingen fil videre", () => {
    const onFile = vi.fn();
    render(<HbDropzone onFile={onFile} tekst="Træk hertil" busy busyTekst="Læser fil…" />);
    const knap = screen.getByRole("button");
    expect(knap).toBeDisabled();
    expect(knap).toHaveTextContent("Læser fil…");
    fireEvent.drop(knap, { dataTransfer: { files: [fil()] } });
    expect(onFile).not.toHaveBeenCalled();
  });

  it("disabled spærrer på samme måde", () => {
    const onFile = vi.fn();
    render(<HbDropzone onFile={onFile} tekst="Træk hertil" disabled />);
    expect(screen.getByRole("button")).toBeDisabled();
    fireEvent.drop(screen.getByRole("button"), { dataTransfer: { files: [fil()] } });
    expect(onFile).not.toHaveBeenCalled();
  });
});
