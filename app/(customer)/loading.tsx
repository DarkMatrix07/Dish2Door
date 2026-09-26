// Shown while a customer page is fetched. It keeps the page's shape (nav, heading,
// cards) instead of the old full-screen splash, so moving between pages feels like
// the content filling in rather than the whole site blinking out.
export default function CustomerLoading() {
  return (
    <main className="min-h-screen bg-[#f7f3eb]" role="status" aria-label="Loading">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-6 sm:px-8 lg:px-12">
        <div className="flex items-center gap-3">
          <span className="skeleton h-9 w-9 rounded-md" />
          <span className="skeleton h-5 w-28 rounded" />
        </div>
        <span className="skeleton h-10 w-10 rounded-md md:w-24" />
      </div>
      <div className="mx-auto max-w-[1440px] px-5 pt-14 sm:px-8 lg:px-12">
        <span className="skeleton block h-4 w-40 rounded" />
        <span className="skeleton mt-6 block h-12 w-[82%] max-w-3xl rounded-lg sm:h-16" />
        <span className="skeleton mt-3 block h-12 w-[60%] max-w-2xl rounded-lg sm:h-16" />
        <span className="skeleton mt-7 block h-4 w-[90%] max-w-xl rounded" />
        <span className="skeleton mt-2 block h-4 w-[70%] max-w-lg rounded" />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <div key={key} className={key > 0 ? "hidden sm:block" : ""}>
              <span className="skeleton block aspect-[4/3] w-full rounded-2xl" />
              <span className="skeleton mt-4 block h-5 w-2/3 rounded" />
              <span className="skeleton mt-2 block h-4 w-1/3 rounded" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
