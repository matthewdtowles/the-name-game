import { render, screen } from "@testing-library/react-native";

import Home from "../app/index";

it("renders the title", async () => {
  await render(<Home />);
  expect(screen.getByText("The Name Game")).toBeTruthy();
});
