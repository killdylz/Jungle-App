// How many classes the gym has actually RUN, for the Members header.
//
// A `class_instances` row is created when a week is PUBLISHED, ahead of time, and
// a re-slot leaves the old occurrence on the books by design. Neither is a class
// that happened. The one record in the product that a class took place is a
// check-in against it — session history carries no instance id — so a class
// counts when at least one person is checked into it. See RosterScreen.
export function classesWithCheckIns(classes = [], attendance = []) {
  const attended = new Set((attendance || []).map((a) => a?.classInstanceId).filter(Boolean));
  return (classes || []).filter((c) => c?.id && attended.has(c.id)).length;
}
