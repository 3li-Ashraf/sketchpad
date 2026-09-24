/** @file Queries the component tests share. */

import { screen } from "@testing-library/react";
import { expect } from "vitest";

export const button = (name: string) => screen.getByRole("button", { name });

/** The one dialog open; `findByRole` also proves it is the only one. */
export const findDialog = () => screen.findByRole("alertdialog");

export const expectNoDialog = () =>
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

export const dontAskAgain = () =>
    screen.getByRole("checkbox", { name: "Don't ask again" });
